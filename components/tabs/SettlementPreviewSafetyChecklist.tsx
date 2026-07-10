"use client";

import { FiCheckCircle } from "react-icons/fi";
import { motion } from "motion/react";

type SettlementPreviewSafetyChecklistProps = {
  reducedMotion: boolean;
};

const items = [
  "Final Tab is locked",
  "Confirmed expenses only",
  "Authorizations are active",
  "Caps cover each share",
  "Cancel window is open",
];

export function SettlementPreviewSafetyChecklist({
  reducedMotion,
}: SettlementPreviewSafetyChecklistProps) {
  return (
    <div className="rounded-md border border-outline-variant bg-surface-container-low p-4">
      <h3 className="text-sm font-semibold text-foreground">Safety check</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm leading-6 text-muted"
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            key={item}
            transition={{ delay: reducedMotion ? 0 : index * 0.03, duration: 0.16 }}
          >
            <FiCheckCircle aria-hidden="true" className="shrink-0 text-primary" />
            <span>{item}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
