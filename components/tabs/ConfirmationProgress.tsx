"use client";

import { FiAlertCircle, FiCheckCircle, FiClock } from "react-icons/fi";
import { StatusChip } from "@/components/ui/StatusChip";
import type { ExpenseView } from "@/components/tabs/expenseTypes";

type ConfirmationProgressProps = {
  expense: ExpenseView;
};

export function ConfirmationProgress({ expense }: ConfirmationProgressProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {expense.splits.map(({ confirmation, member, split }) => {
        const status = confirmation?.status ?? "pending";
        const tone =
          status === "confirmed" ? "success" : status === "disputed" ? "error" : "neutral";
        const icon =
          status === "confirmed" ? (
            <FiCheckCircle aria-hidden="true" />
          ) : status === "disputed" ? (
            <FiAlertCircle aria-hidden="true" />
          ) : (
            <FiClock aria-hidden="true" />
          );
        const label =
          status === "confirmed"
            ? "Confirmed"
            : status === "disputed"
              ? "Disputed"
              : "Needs review";

        return (
          <StatusChip className="gap-1.5" key={split.id} tone={tone}>
            {icon}
            <span className="max-w-36 truncate">{member?.displayName ?? "Member"}</span>
            <span>{label}</span>
          </StatusChip>
        );
      })}
    </div>
  );
}
