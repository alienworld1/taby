"use client";

import { FiFileText } from "react-icons/fi";
import { Card } from "@/components/ui/Card";
import type { TabResponse } from "@/lib/tabs/types";

type ExpensePlaceholderProps = {
  memberCount: number;
  tab: TabResponse;
};

export function ExpensePlaceholder({ memberCount, tab }: ExpensePlaceholderProps) {
  const isReadOnly = tab.status === "settled" || tab.status === "cancelled";
  const title = isReadOnly
    ? "This tab is read-only."
    : memberCount > 1
      ? "This tab is ready for expenses."
      : "Invite members first. Expenses come next.";
  const description = isReadOnly
    ? "You can still review the people and tab details."
    : memberCount > 1
      ? "You have the group shape in place. Expense entry is the next step."
      : "Start with registered Taby accounts who should review expenses in this tab.";

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong">
        <FiFileText aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
    </Card>
  );
}
