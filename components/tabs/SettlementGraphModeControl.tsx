"use client";

import { motion } from "motion/react";
import { FiRepeat } from "react-icons/fi";
import { cn } from "@/lib/cn";
import type { SettlementGraphMode } from "@/lib/tabs/settlementGraph";

type SettlementGraphModeControlProps = {
  disabled?: boolean;
  mode: SettlementGraphMode;
  onModeChange: (mode: SettlementGraphMode) => void;
  reducedMotion: boolean;
};

const modes: Array<{ label: string; value: SettlementGraphMode }> = [
  { label: "Before netting", value: "before" },
  { label: "After netting", value: "after" },
];

export function SettlementGraphModeControl({
  disabled = false,
  mode,
  onModeChange,
  reducedMotion,
}: SettlementGraphModeControlProps) {
  return (
    <div
      aria-label="Settlement graph mode"
      className="grid grid-cols-2 rounded-2xl border border-outline-variant bg-surface-container-low p-1"
      role="radiogroup"
    >
      {modes.map((item) => {
        const selected = item.value === mode;

        return (
          <button
            key={item.value}
            aria-checked={selected}
            className={cn(
              "relative isolate inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
              selected ? "text-primary-strong" : "text-muted hover:text-foreground",
            )}
            disabled={disabled}
            role="radio"
            type="button"
            onClick={() => onModeChange(item.value)}
          >
            {selected ? (
              <motion.span
                className="absolute inset-0 -z-10 rounded-xl bg-surface-container-lowest shadow-soft"
                layoutId="settlement-graph-mode"
                transition={reducedMotion ? { duration: 0 } : { duration: 0.22 }}
              />
            ) : null}
            <FiRepeat aria-hidden="true" className="size-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
