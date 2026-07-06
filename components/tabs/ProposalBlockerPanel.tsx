"use client";

import { FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import { motion } from "motion/react";
import type { ProposalBlocker } from "@/components/tabs/proposalUtils";

type ProposalBlockerPanelProps = {
  blockers: ProposalBlocker[];
  reducedMotion: boolean;
};

export function ProposalBlockerPanel({ blockers, reducedMotion }: ProposalBlockerPanelProps) {
  if (blockers.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-primary-fixed bg-primary-soft px-4 py-3 text-primary-strong">
        <FiCheckCircle aria-hidden="true" className="mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold">Ready for review</h3>
          <p className="mt-1 text-sm leading-6">
            The proposal can be locked when your group is ready.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-outline-variant bg-surface-container-low p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FiAlertCircle aria-hidden="true" className="text-secondary" />
        Needs attention
      </h3>
      <div className="grid gap-2">
        {blockers.map((blocker) => (
          <motion.div
            key={blocker.id}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm leading-6 text-muted"
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
          >
            {blocker.message}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
