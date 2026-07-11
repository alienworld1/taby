import { FiArrowDownLeft, FiArrowUpRight, FiMinus } from "react-icons/fi";
import { formatUsdc } from "@/lib/tabs/money";
import type { FinalTabReceiptOutcome } from "@/lib/tabs/types";

type FinalTabReceiptOutcomeListProps = {
  outcomes: FinalTabReceiptOutcome[];
};

function outcomeLabel(direction: FinalTabReceiptOutcome["direction"]) {
  if (direction === "paid") {
    return "Paid";
  }

  if (direction === "received") {
    return "Received";
  }

  return "No payment needed";
}

function outcomeIcon(direction: FinalTabReceiptOutcome["direction"]) {
  if (direction === "paid") {
    return <FiArrowUpRight aria-hidden="true" />;
  }

  if (direction === "received") {
    return <FiArrowDownLeft aria-hidden="true" />;
  }

  return <FiMinus aria-hidden="true" />;
}

function outcomeTone(direction: FinalTabReceiptOutcome["direction"]) {
  if (direction === "paid") {
    return "text-debtor";
  }

  if (direction === "received") {
    return "text-creditor";
  }

  return "text-neutral";
}

export function FinalTabReceiptOutcomeList({ outcomes }: FinalTabReceiptOutcomeListProps) {
  return (
    <section className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-lowest p-5 shadow-soft">
      <h2 className="text-xl font-semibold leading-7 text-foreground">Member outcomes</h2>
      <div className="grid gap-2">
        {outcomes.map((outcome) => (
          <div
            className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-md border border-outline-variant bg-surface-container-low px-3 py-3 sm:grid-cols-[auto_1fr_auto]"
            key={outcome.memberId}
          >
            <span
              className={`grid size-9 place-items-center rounded-full bg-surface-container-lowest ${outcomeTone(outcome.direction)}`}
            >
              {outcomeIcon(outcome.direction)}
            </span>
            <div className="min-w-0">
              <p className="break-words font-semibold text-foreground">{outcome.memberName}</p>
              <p className="text-sm text-muted">{outcomeLabel(outcome.direction)}</p>
            </div>
            <p className="col-span-2 font-semibold text-foreground sm:col-span-1 sm:text-right">
              {outcome.direction === "settled" ? "0.00 USDC" : formatUsdc(outcome.amountBaseUnits)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
