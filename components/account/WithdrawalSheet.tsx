"use client";

import { useMemo, useState } from "react";
import { FiArrowRight, FiCheckCircle } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import type { SettlementFundingSnapshot } from "@/lib/account/types";
import { formatUsdc, parseUsdcToBaseUnits } from "@/lib/tabs/money";

type WithdrawalSheetProps = {
  defaultRecipient: string;
  funding: SettlementFundingSnapshot;
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { amount: string; recipientAddress: string }) => Promise<void>;
};

export function WithdrawalSheet({
  defaultRecipient,
  funding,
  open,
  submitting,
  onOpenChange,
  onSubmit,
}: WithdrawalSheetProps) {
  const [amount, setAmount] = useState("");
  const [customRecipient, setCustomRecipient] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRecipient = customRecipient ? recipient.trim() : defaultRecipient;
  const parsed = useMemo(() => parseUsdcToBaseUnits(amount), [amount]);
  const available = BigInt(funding.availableToWithdrawBaseUnits);
  const remaining = parsed && parsed <= available ? available - parsed : available;

  function close(nextOpen: boolean) {
    if (!nextOpen) {
      setAmount("");
      setCustomRecipient(false);
      setRecipient("");
      setReviewing(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  function review() {
    if (!parsed) return setError("Enter a USDC amount with up to 6 decimal places.");
    if (parsed > available) return setError("That amount is reserved for Final Tabs or exceeds your balance.");
    if (customRecipient && !/^0x[a-fA-F0-9]{40}$/.test(selectedRecipient)) {
      return setError("Enter a valid recipient address.");
    }
    setError(null);
    setReviewing(true);
  }

  async function confirm() {
    setError(null);
    try {
      await onSubmit({ amount, recipientAddress: customRecipient ? selectedRecipient : "" });
      close(false);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not start the withdrawal.");
    }
  }

  return (
    <Sheet
      description="Move USDC from your settlement wallet. Your active Final Tabs remain reserved."
      onOpenChange={close}
      open={open}
      preventClose={submitting}
      title={reviewing ? "Review withdrawal" : "Withdraw USDC"}
    >
      {reviewing ? (
        <div className="grid gap-4">
          <div className="rounded-md border border-outline-variant bg-surface-container-low p-4">
            <p className="font-mono text-xs uppercase text-muted">You’re sending</p>
            <p className="mt-1 text-2xl font-semibold">{parsed ? formatUsdc(parsed) : "—"}</p>
            <p className="mt-4 font-mono text-xs uppercase text-muted">To</p>
            <p className="mt-1 break-all font-mono text-sm text-foreground">{selectedRecipient}</p>
            <p className="mt-1 text-sm text-muted">
              {customRecipient ? "Custom recipient" : "Your sign-in wallet"}
            </p>
          </div>
          <div className="grid gap-2 text-sm text-muted">
            <p>Reserved for Final Tabs: {formatUsdc(funding.reservedForFinalTabsBaseUnits)}</p>
            <p>Available after withdrawal: {formatUsdc(remaining)}</p>
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <div className="flex gap-3">
            <Button disabled={submitting} onClick={() => setReviewing(false)} variant="secondary">
              Back
            </Button>
            <Button icon={<FiCheckCircle aria-hidden="true" />} loading={submitting} onClick={confirm}>
              Confirm withdrawal
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <Input
            inputMode="decimal"
            label="Amount in USDC"
            max={formatUsdc(funding.availableToWithdrawBaseUnits).replace(" USDC", "")}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            value={amount}
          />
          <p className="text-sm text-muted">Available to withdraw: {formatUsdc(funding.availableToWithdrawBaseUnits)}</p>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input checked={customRecipient} onChange={(event) => setCustomRecipient(event.target.checked)} type="checkbox" />
            Send to another address
          </label>
          {customRecipient ? (
            <Input label="Recipient address" onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" value={recipient} />
          ) : (
            <p className="rounded-md bg-surface-container-low p-3 text-sm text-muted">
              Funds will return to your sign-in wallet: <span className="font-mono text-xs">{defaultRecipient}</span>
            </p>
          )}
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <Button icon={<FiArrowRight aria-hidden="true" />} onClick={review}>Review withdrawal</Button>
        </div>
      )}
    </Sheet>
  );
}
