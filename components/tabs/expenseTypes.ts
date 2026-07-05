import type {
  ExpenseConfirmationResponse,
  ExpenseResponse,
  ExpenseSplitResponse,
  TabMemberResponse,
} from "@/lib/tabs/types";

export type ExpenseView = {
  confirmations: ExpenseConfirmationResponse[];
  expense: ExpenseResponse;
  payer: TabMemberResponse | null;
  splits: Array<{
    member: TabMemberResponse | null;
    split: ExpenseSplitResponse;
    confirmation: ExpenseConfirmationResponse | null;
  }>;
};
