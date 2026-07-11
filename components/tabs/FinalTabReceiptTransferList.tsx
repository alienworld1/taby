import { FiArrowRight } from "react-icons/fi";
import { formatUsdc } from "@/lib/tabs/money";
import type { FinalTabReceiptTransfer } from "@/lib/tabs/types";

const RECEIPT_TRANSFER_PREVIEW_LIMIT = 20;

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
  const visibleTransfers = transfers.slice(0, RECEIPT_TRANSFER_PREVIEW_LIMIT);
  const hiddenTransfers = transfers.slice(RECEIPT_TRANSFER_PREVIEW_LIMIT);

  return (
    <section className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-lowest p-5 shadow-soft">
      <h2 className="text-xl font-semibold leading-7 text-foreground">Final transfers</h2>
      {transfers.length === 0 ? (
        <div className="rounded-md border border-outline-variant bg-surface-container-low p-3 text-sm text-muted">
          No payment was needed to close this tab.
        </div>
      ) : (
        <div className="grid gap-2">
          {visibleTransfers.map((transfer) => (
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
          {hiddenTransfers.length > 0 ? (
            <details className="rounded-md border border-outline-variant bg-surface-container-low p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Show {hiddenTransfers.length} more transfers
              </summary>
              <div className="mt-3 grid gap-2">
                {hiddenTransfers.map((transfer) => (
                  <div
                    className="grid gap-2 rounded-md border border-outline-variant bg-surface-container-lowest p-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center"
                    key={transfer.id}
                  >
                    <p className="break-words font-semibold text-foreground">
                      {transfer.fromMemberName}
                    </p>
                    <FiArrowRight aria-hidden="true" className="hidden text-primary sm:block" />
                    <p className="break-words font-semibold text-foreground sm:text-right">
                      {transfer.toMemberName}
                    </p>
                    <p className="font-semibold text-primary-strong sm:text-right">
                      {formatUsdc(transfer.amountBaseUnits)}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
