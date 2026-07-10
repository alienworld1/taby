"use client";

import type { ReactNode } from "react";
import { FiCreditCard } from "react-icons/fi";
import { Card } from "@/components/ui/Card";
import { ReceiptBlock } from "@/components/ui/ReceiptBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { SettlementAccountStatusRow } from "@/components/account/SettlementAccountStatusRow";
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
              Ready for the settlement steps coming later.
            </p>
          </div>
        </div>
        <StatusChip tone="success">Wallet ready</StatusChip>
      </div>
      <div className="mt-5">
        <ReceiptBlock label="Wallet address">
          <p className="break-all">{account.walletAddress}</p>
        </ReceiptBlock>
      </div>
      <SettlementAccountStatusRow readiness={account.settlementAccount} />
    </Card>
  );
}
