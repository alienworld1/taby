"use client";

import type { ReactNode } from "react";
import { FiCreditCard } from "react-icons/fi";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { SettlementAccountStatusRow } from "@/components/account/SettlementAccountStatusRow";
import { SettlementFundingPanel } from "@/components/account/SettlementFundingPanel";
import type { Account } from "@/lib/account/types";

type WalletDetailsCardProps = {
  account: Account;
  icon?: ReactNode;
};

export function WalletDetailsCard({ account, icon }: WalletDetailsCardProps) {
  return (
    <Card tone="soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-container-lowest text-primary">
            {icon ?? <FiCreditCard aria-hidden="true" />}
          </div>
          <div>
            <h2 className="text-lg font-semibold">Settlement wallet</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Send USDC to the settlement address below before a Final Tab closes.
            </p>
          </div>
        </div>
        <StatusChip tone="success">Wallet ready</StatusChip>
      </div>
      {account.settlementAccount?.accountType === "zerodev_kernel" ? (
        <SettlementFundingPanel account={account} />
      ) : (
        <div className="mt-5">
          <p className="break-all rounded-md bg-surface-container-low p-4 font-mono text-sm text-muted">
            {account.settlementAccount?.delegationStatus === "ready"
              ? account.settlementAccount.settlementAddress
              : "Preparing settlement"}
          </p>
        <details className="mt-3 rounded-md border border-outline-variant bg-surface-container-low px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-muted">
            Sign-in wallet
          </summary>
          <p className="mt-2 break-all font-mono text-xs leading-5 text-muted">
            {account.walletAddress}
          </p>
        </details>
        </div>
      )}
      <SettlementAccountStatusRow readiness={account.settlementAccount} />
    </Card>
  );
}
