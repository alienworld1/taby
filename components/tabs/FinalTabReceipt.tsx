import { FiArrowLeft } from "react-icons/fi";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { FinalTabReceiptResponse } from "@/lib/tabs/types";
import { FinalTabReceiptExpenseSummary } from "./FinalTabReceiptExpenseSummary";
import { FinalTabReceiptOutcomeList } from "./FinalTabReceiptOutcomeList";
import { FinalTabReceiptProofDrawer } from "./FinalTabReceiptProofDrawer";
import { FinalTabReceiptSummary } from "./FinalTabReceiptSummary";
import { FinalTabReceiptTransferList } from "./FinalTabReceiptTransferList";

type FinalTabReceiptProps = {
  receipt: Extract<FinalTabReceiptResponse, { status: "confirmed" }>;
};

export function FinalTabReceipt({ receipt }: FinalTabReceiptProps) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <FinalTabReceiptSummary receipt={receipt} />
      <FinalTabReceiptExpenseSummary receipt={receipt} />
      <FinalTabReceiptOutcomeList outcomes={receipt.memberOutcomes} />
      <FinalTabReceiptTransferList transfers={receipt.transfers} />
      <FinalTabReceiptProofDrawer proof={receipt.proof} />
      <div>
        <ButtonLink
          className="w-full sm:w-auto"
          href={`/tabs/${receipt.tab.id}`}
          icon={<FiArrowLeft aria-hidden="true" />}
          variant="secondary"
        >
          Back to tab
        </ButtonLink>
      </div>
    </div>
  );
}
