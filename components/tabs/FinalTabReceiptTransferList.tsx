import { FiArrowRight } from "react-icons/fi";
import { formatUsdc } from "@/lib/tabs/money";
import type { FinalTabReceiptTransfer } from "@/lib/tabs/types";

type FinalTabReceiptTransferListProps = {
  transfers: FinalTabReceiptTransfer[];
};

function shortAddress(value: string | null) {
  if (!value) {
    return "Wallet not shown";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function FinalTabReceiptTransferList({ transfers }: FinalTabReceiptTransferListProps) {
  return (
    <section className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-lowest p-5 shadow-soft">
      <h2 className="text-xl font-semibold leading-7 text-foreground">Final transfers</h2>
      {transfers.length === 0 ? (
        <div className="rounded-md border border-outline-variant bg-surface-container-low p-3 text-sm text-muted">
          No payment was needed to close this tab.
        </div>
      ) : (
        <div className="grid gap-2">
          {transfers.map((transfer) => (
            <div
              className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-3"
              key={transfer.id}
            >
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-foreground">
                    {transfer.fromMemberName}
                  </p>
                  <p className="break-all font-mono text-xs text-muted">
                    {shortAddress(transfer.fromWalletAddress)}
                  </p>
                </div>
                <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary">
                  <FiArrowRight aria-hidden="true" />
                </span>
                <div className="min-w-0 text-right">
                  <p className="break-words font-semibold text-foreground">
                    {transfer.toMemberName}
                  </p>
                  <p className="break-all font-mono text-xs text-muted">
                    {shortAddress(transfer.toWalletAddress)}
                  </p>
                </div>
              </div>
              <p className="rounded-md bg-surface-container-lowest px-3 py-2 text-right font-semibold text-primary-strong">
                {formatUsdc(transfer.amountBaseUnits)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
