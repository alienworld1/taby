"use client";

import { motion } from "motion/react";
import { ExpenseCard } from "@/components/tabs/ExpenseCard";
import type { ExpenseView } from "@/components/tabs/expenseTypes";

type ExpenseGroupProps = {
  description?: string;
  expenses: ExpenseView[];
  title: string;
  onOpenExpense: (expenseId: string) => void;
};

export function ExpenseGroup({
  description,
  expenses,
  title,
  onOpenExpense,
}: ExpenseGroupProps) {
  if (expenses.length === 0) {
    return null;
  }

  return (
    <motion.section className="grid gap-3" layout>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-normal text-muted">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      <div className="grid gap-3">
        {expenses.map((expense) => (
          <ExpenseCard
            expense={expense}
            key={expense.expense.id}
            onOpen={() => onOpenExpense(expense.expense.id)}
          />
        ))}
      </div>
    </motion.section>
  );
}
