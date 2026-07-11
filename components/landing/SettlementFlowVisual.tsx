"use client";

import { motion, useReducedMotion } from "motion/react";
import { FiArrowRight, FiCheck } from "react-icons/fi";

const obligations = [
  "A → D",
  "S → A",
  "J → S",
  "D → J",
  "A → J",
  "S → D",
  "J → A",
  "D → S",
  "A → S",
  "J → D",
  "S → J",
];

export function SettlementFlowVisual() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant pb-4">
          <p className="font-semibold">Before agreement</p>
          <p className="font-mono text-xs text-muted">11 obligations</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {obligations.map((obligation, index) => (
            <motion.span
              className="rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1.5 font-mono text-[0.65rem] text-muted"
              initial={{ opacity: 0.35 }}
              key={obligation}
              transition={{ delay: shouldReduceMotion ? 0 : index * 0.04, duration: shouldReduceMotion ? 0 : 0.35 }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1 }}
            >
              {obligation}
            </motion.span>
          ))}
        </div>
      </div>

      <motion.div
        className="mx-auto grid size-12 place-items-center rounded-full bg-primary text-on-primary shadow-soft lg:mx-0"
        initial={{ scale: 0.8 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.45 }}
        viewport={{ once: true }}
        whileInView={{ scale: 1 }}
      >
        <FiArrowRight className="rotate-90 lg:rotate-0" />
      </motion.div>

      <div className="rounded-xl border border-primary-fixed bg-primary-wash p-5">
        <div className="flex items-center justify-between gap-3 border-b border-primary-fixed pb-4">
          <p className="font-semibold text-primary-strong">Final Tab</p>
          <p className="font-mono text-xs text-primary">2 transfers</p>
        </div>
        <div className="mt-5 space-y-3">
          {[{ amount: "18.40", from: "Daniel", to: "Aisha" }, { amount: "67.80", from: "Jordan", to: "Sofia" }].map((transfer, index) => (
            <motion.div
              className="rounded-lg border border-primary-fixed bg-surface-container-lowest p-4"
              initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 18 }}
              key={transfer.from}
              transition={{ delay: shouldReduceMotion ? 0 : 0.35 + index * 0.14, duration: shouldReduceMotion ? 0 : 0.45 }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1, x: 0 }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{transfer.from} → {transfer.to}</p>
                <FiCheck className="text-primary" />
              </div>
              <p className="mt-1 font-mono text-sm text-primary-strong">{transfer.amount} USDC</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
