"use client";

import { FiClock } from "react-icons/fi";
import { motion } from "motion/react";

type SettlementCountdownProps = {
  durationSeconds: number;
  reducedMotion: boolean;
  secondsRemaining: number;
};

export function SettlementCountdown({
  durationSeconds,
  reducedMotion,
  secondsRemaining,
}: SettlementCountdownProps) {
  const clampedSeconds = Math.max(0, secondsRemaining);
  const progress =
    durationSeconds > 0 ? (durationSeconds - clampedSeconds) / durationSeconds : 1;

  return (
    <div
      aria-live="polite"
      className="rounded-md border border-outline-variant bg-surface-container-low p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <FiClock aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Settlement starts in</p>
            <p className="text-sm leading-6 text-muted">You can cancel before settlement starts.</p>
          </div>
        </div>
        <span className="shrink-0 font-mono text-2xl font-semibold text-foreground">
          {clampedSeconds}s
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container-high">
        <motion.div
          animate={{ scaleX: progress }}
          className="h-full origin-left rounded-full bg-primary"
          initial={false}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
        />
      </div>
    </div>
  );
}
