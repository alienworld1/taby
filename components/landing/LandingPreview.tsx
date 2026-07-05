"use client";

import { motion } from "motion/react";
import { FiArrowRight, FiCheckCircle, FiMinusCircle } from "react-icons/fi";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";

type PreviewItem = {
  amount: string;
  fromName?: string;
  id: string;
  label: string;
  status: "expense" | "confirmed" | "settlement";
  toName?: string;
};

const previewItems: PreviewItem[] = [
  {
    amount: "72.00 USDC",
    id: "stay",
    label: "Stay deposit",
    status: "confirmed",
  },
  {
    amount: "18.40 USDC",
    id: "snacks",
    label: "Groceries",
    status: "expense",
  },
  {
    amount: "41.20 USDC",
    id: "cab",
    label: "Airport ride",
    status: "confirmed",
  },
];

const settlements: PreviewItem[] = [
  {
    amount: "36.80 USDC",
    fromName: "Mina",
    id: "mina-to-avi",
    label: "Mina pays Avi",
    status: "settlement",
    toName: "Avi",
  },
  {
    amount: "21.60 USDC",
    fromName: "Noor",
    id: "noor-to-avi",
    label: "Noor pays Avi",
    status: "settlement",
    toName: "Avi",
  },
];

export function LandingPreview() {
  return (
    <Card className="relative overflow-hidden p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-medium uppercase text-muted">Shared weekend</p>
          <h2 className="mt-1 text-lg font-semibold">11 IOUs become 2 settlements</h2>
        </div>
        <StatusChip tone="pending">Preview</StatusChip>
      </div>

      <div className="mt-5 grid gap-3">
        {previewItems.map((item, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-3 rounded-md border border-outline-variant bg-surface-container-low p-3"
            initial={{ opacity: 0, y: 10 }}
            key={item.id}
            transition={{ delay: 0.12 + index * 0.08, duration: 0.35 }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-container-lowest text-primary">
                {item.status === "confirmed" ? (
                  <FiCheckCircle aria-hidden="true" />
                ) : (
                  <FiMinusCircle aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.label}</p>
                <p className="text-sm text-muted">
                  {item.status === "confirmed" ? "Confirmed together" : "Ready to confirm"}
                </p>
              </div>
            </div>
            <p className="shrink-0 font-mono text-sm text-muted">{item.amount}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="my-5 flex items-center justify-center gap-2 text-sm font-semibold text-primary"
        initial={{ opacity: 0, scale: 0.96 }}
        transition={{ delay: 0.5, duration: 0.35 }}
      >
        <span className="h-px w-12 bg-outline-variant" />
        <FiArrowRight aria-hidden="true" />
        <span>compress</span>
        <span className="h-px w-12 bg-outline-variant" />
      </motion.div>

      <div className="grid gap-3">
        {settlements.map((item, index) => (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="rounded-md border border-primary-fixed bg-primary-soft p-3"
            initial={{ opacity: 0, x: 18 }}
            key={item.id}
            transition={{ delay: 0.62 + index * 0.1, duration: 0.35 }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">
                {item.fromName} pays {item.toName}
              </p>
              <p className="font-mono text-sm text-primary-strong">{item.amount}</p>
            </div>
            <p className="mt-1 text-sm text-primary-strong">
              One clean transfer, visible to the whole tab.
            </p>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
