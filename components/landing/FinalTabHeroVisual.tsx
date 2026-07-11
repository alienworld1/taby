"use client";

import { motion, useReducedMotion } from "motion/react";
import { FiCheck, FiLock, FiMinus, FiUsers } from "react-icons/fi";

const acceptedExpenses = [
  { amount: "1,240.00", label: "Accommodation" },
  { amount: "286.40", label: "Equipment hire" },
  { amount: "164.80", label: "Team dinner" },
];

export function FinalTabHeroVisual() {
  const shouldReduceMotion = useReducedMotion();
  const duration = shouldReduceMotion ? 0 : 0.55;

  return (
    <div aria-hidden="true" className="relative min-h-[34rem] w-full sm:min-h-[38rem]">
      <div className="absolute inset-y-6 left-[16%] w-px bg-primary-soft" />
      <div className="absolute inset-x-4 top-1/2 h-px bg-primary-soft" />

      <div className="absolute left-0 top-12 z-10 grid w-[48%] gap-3 sm:left-2 sm:w-[42%]">
        {acceptedExpenses.map((expense, index) => (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 shadow-soft"
            initial={{ opacity: 0, x: -22 }}
            key={expense.label}
            transition={{ delay: shouldReduceMotion ? 0 : 0.12 + index * 0.1, duration }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{expense.label}</p>
              <FiCheck className="shrink-0 text-primary" />
            </div>
            <p className="mt-1 font-mono text-[0.65rem] text-muted">{expense.amount} USDC</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        animate={{ opacity: 1, rotate: -3, x: 0 }}
        className="absolute bottom-14 left-0 z-20 w-[44%] rounded-lg border border-debtor/40 bg-coral-wash px-3 py-3 shadow-soft sm:left-4 sm:w-[38%]"
        initial={{ opacity: 0, rotate: 0, x: 16 }}
        transition={{ delay: shouldReduceMotion ? 0 : 0.55, duration }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Taxi</p>
          <FiMinus className="text-debtor" />
        </div>
        <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-debtor">
          Disputed · stays out
        </p>
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-6 right-0 top-6 z-10 w-[64%] rounded-2xl border border-primary-fixed bg-surface-container-lowest p-5 shadow-[0_24px_70px_rgba(15,76,68,0.13)] sm:w-[62%] sm:p-7"
        initial={{ opacity: 0, y: 18 }}
        transition={{ delay: shouldReduceMotion ? 0 : 0.35, duration: shouldReduceMotion ? 0 : 0.65 }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant pb-5">
          <div>
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.12em] text-primary">
              Final Tab / 04
            </p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">Project team expenses</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 font-mono text-[0.65rem] font-medium uppercase text-primary-strong">
            <FiLock /> Locked
          </div>
        </div>

        <div className="space-y-4 py-5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Agreed expenses</span>
            <span className="font-mono font-medium">6 included</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Unresolved</span>
            <span className="font-mono text-debtor">1 excluded</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Final settlement</span>
            <span className="font-mono font-medium">2 transfers</span>
          </div>
        </div>

        <div className="rounded-lg bg-primary-wash p-4">
          <div className="flex items-center gap-2 text-primary-strong">
            <FiUsers />
            <p className="text-sm font-semibold">Everyone approves their part</p>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {["AM", "DK", "SP", "JL"].map((initials, index) => (
              <motion.div
                animate={{ scale: 1 }}
                className="grid aspect-square place-items-center rounded-full border-2 border-surface-container-lowest bg-primary text-xs font-semibold text-on-primary shadow-soft"
                initial={{ scale: 0.72 }}
                key={initials}
                transition={{ delay: shouldReduceMotion ? 0 : 0.78 + index * 0.08, duration: shouldReduceMotion ? 0 : 0.3 }}
              >
                {initials}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-outline-variant pt-5">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-muted">Total agreed</p>
            <p className="mt-1 font-mono text-lg font-semibold text-primary-strong sm:text-xl">1,691.20 USDC</p>
          </div>
          <div className="h-2 w-12 rounded-full bg-coral" />
        </div>
      </motion.div>
    </div>
  );
}
