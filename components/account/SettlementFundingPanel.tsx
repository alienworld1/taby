"use client";

import { useCallback, useState } from "react";
import { FiCopy, FiRefreshCw, FiSend } from "react-icons/fi";
import { useAuth } from "@/components/auth/useAuth";
import { WithdrawalSheet } from "@/components/account/WithdrawalSheet";
import { Button } from "@/components/ui/Button";
import { ReceiptBlock } from "@/components/ui/ReceiptBlock";
import { createSettlementAccountClient, sendSponsoredUsdcWithdrawal } from "@/lib/account/zerodev/browser";
import type { Account, SettlementFundingSnapshot, WithdrawalResponse } from "@/lib/account/types";
import { formatUsdc } from "@/lib/tabs/money";

export function SettlementFundingPanel({ account }: { account: Account }) {
  const { getDidToken, getWalletProvider } = useAuth();
  const [funding, setFunding] = useState<SettlementFundingSnapshot | null>(null);
  const [status, setStatus] = useState<WithdrawalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const readyKernel = account.settlementAccount?.delegationStatus === "ready" && account.settlementAccount.accountType === "zerodev_kernel";

  const refresh = useCallback(async () => {
    if (!readyKernel) return;
    setLoading(true);
    setError(null);
    try {
      const didToken = await getDidToken();
      if (!didToken) throw new Error("Sign in again to refresh your balance.");
      const response = await fetch("/api/account/funding", { headers: { Authorization: `Bearer ${didToken}` }, cache: "no-store" });
      const payload = (await response.json()) as { funding?: SettlementFundingSnapshot; code?: string };
      if (!response.ok || !payload.funding) throw new Error(payload.code === "chain_unavailable" ? "We could not check your balance. Try again." : "Your settlement wallet is not ready.");
      setFunding(payload.funding);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "We could not refresh your funding status.");
    } finally { setLoading(false); }
  }, [getDidToken, readyKernel]);

  async function withdraw(input: { amount: string; recipientAddress: string }) {
    const didToken = await getDidToken();
    const magicProvider = getWalletProvider();
    if (!didToken || !magicProvider || !account.settlementAccount) throw new Error("Sign in again before withdrawing.");
    const idempotencyKey = crypto.randomUUID().replaceAll("-", "");
    setSubmitting(true);
    const preparedResponse = await fetch("/api/account/withdrawals", {
      body: JSON.stringify({ action: "prepare", amount: input.amount, didToken, idempotencyKey, recipientAddress: input.recipientAddress }),
      headers: { "Content-Type": "application/json" }, method: "POST",
    });
    const prepared = (await preparedResponse.json()) as { code?: string; withdrawal?: WithdrawalResponse };
    if (!preparedResponse.ok || !prepared.withdrawal) {
      setSubmitting(false);
      throw new Error(prepared.code === "insufficient_withdrawable_balance" ? "That amount is reserved for Final Tabs or exceeds your balance." : "We could not prepare this withdrawal.");
    }
    let submitted = false;
    try {
      const client = await createSettlementAccountClient({ accountType: "zerodev_kernel", didToken, magicProvider, magicWalletAddress: account.walletAddress });
      const receipt = await sendSponsoredUsdcWithdrawal(client.kernelClient, {
        amountBaseUnits: BigInt(prepared.withdrawal.amountBaseUnits), recipientAddress: prepared.withdrawal.recipientAddress as `0x${string}`,
      }, async (userOperationHash) => {
        const response = await fetch("/api/account/withdrawals", { body: JSON.stringify({ action: "submit", didToken, id: prepared.withdrawal?.id, userOperationHash }), headers: { "Content-Type": "application/json" }, method: "POST" });
        if (!response.ok) throw new Error("We could not record this withdrawal. Refresh status.");
        submitted = true;
      });
      const reconciledResponse = await fetch("/api/account/withdrawals", { body: JSON.stringify({ action: "reconcile", didToken, id: prepared.withdrawal.id, transactionHash: receipt.transactionHash }), headers: { "Content-Type": "application/json" }, method: "POST" });
      const reconciled = (await reconciledResponse.json()) as { withdrawal?: WithdrawalResponse };
      setStatus(reconciled.withdrawal ?? { ...prepared.withdrawal, status: "submitted", transactionHash: receipt.transactionHash });
      await refresh();
    } catch (withdrawalError) {
      if (!submitted) {
        await fetch("/api/account/withdrawals", { body: JSON.stringify({ action: "reject", didToken, errorMessage: withdrawalError instanceof Error ? withdrawalError.message : undefined, id: prepared.withdrawal.id }), headers: { "Content-Type": "application/json" }, method: "POST" });
        setStatus({ ...prepared.withdrawal, status: "rejected" });
      } else {
        setStatus({ ...prepared.withdrawal, status: "submitted" });
      }
      throw withdrawalError;
    } finally { setSubmitting(false); }
  }

  async function checkWithdrawal() {
    if (!status) return;
    const didToken = await getDidToken();
    if (!didToken) return setError("Sign in again to check this withdrawal.");
    setLoading(true);
    try {
      const response = await fetch("/api/account/withdrawals", {
        body: JSON.stringify({ action: "reconcile", didToken, id: status.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { withdrawal?: WithdrawalResponse };
      if (!response.ok || !payload.withdrawal) throw new Error("We could not check this withdrawal yet.");
      setStatus(payload.withdrawal);
      await refresh();
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "We could not check this withdrawal yet.");
    } finally { setLoading(false); }
  }

  if (!readyKernel) return null;
  return (
    <div className="mt-5 grid gap-4">
      <ReceiptBlock label="USDC deposit address">
        <div className="flex gap-3"><p className="min-w-0 flex-1 break-all">{account.settlementAccount?.settlementAddress}</p><button aria-label="Copy deposit address" className="text-primary" onClick={() => void navigator.clipboard.writeText(account.settlementAccount?.settlementAddress ?? "")} type="button"><FiCopy aria-hidden="true" /></button></div>
      </ReceiptBlock>
      <p className="text-sm text-muted">Arbitrum Sepolia · USDC only</p>
      {funding ? <div className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4 sm:grid-cols-3"><Metric label="Balance" value={formatUsdc(funding.balanceBaseUnits)} /><Metric label="Reserved for Final Tabs" value={formatUsdc(funding.reservedForFinalTabsBaseUnits)} /><Metric label="Available to withdraw" value={formatUsdc(funding.availableToWithdrawBaseUnits)} /></div> : null}
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {status ? <div className="flex flex-wrap items-center gap-3"><p aria-live="polite" className="text-sm text-muted">{withdrawalMessage(status)}</p>{["submitted", "unknown"].includes(status.status) ? <Button loading={loading} onClick={() => void checkWithdrawal()} size="sm" variant="ghost">Check status</Button> : null}</div> : null}
      {!funding && !error ? <p className="text-sm text-muted">Refresh to check your live USDC balance and available withdrawal amount.</p> : null}
      <div className="flex flex-wrap gap-3"><Button icon={<FiRefreshCw aria-hidden="true" />} loading={loading} onClick={() => void refresh()} variant="secondary">{funding ? "Refresh" : "Load balance"}</Button><Button disabled={!funding || BigInt(funding.availableToWithdrawBaseUnits) === BigInt(0)} icon={<FiSend aria-hidden="true" />} onClick={() => setOpen(true)}>Withdraw USDC</Button></div>
      {funding ? <WithdrawalSheet defaultRecipient={account.walletAddress} funding={funding} onOpenChange={setOpen} onSubmit={withdraw} open={open} submitting={submitting} /> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="font-mono text-xs uppercase text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function withdrawalMessage(withdrawal: WithdrawalResponse) {
  if (withdrawal.status === "confirmed") return "Withdrawal confirmed.";
  if (withdrawal.status === "reverted") return "Withdrawal did not go through. Nothing moved.";
  if (withdrawal.status === "rejected") return "Withdrawal could not start. Nothing moved.";
  if (withdrawal.status === "unknown") return "We are still checking this withdrawal.";
  return "Withdrawal is pending confirmation.";
}
