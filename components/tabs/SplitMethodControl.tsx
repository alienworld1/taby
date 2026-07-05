"use client";

import { cn } from "@/lib/cn";

type SplitMethod = "equal" | "custom";

type SplitMethodControlProps = {
  value: SplitMethod;
  onChange: (value: SplitMethod) => void;
};

export function SplitMethodControl({ value, onChange }: SplitMethodControlProps) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold text-foreground">Split method</span>
      <div
        aria-label="Split method"
        className="grid grid-cols-2 rounded-md border border-outline-variant bg-surface-container-low p-1"
        role="radiogroup"
      >
        {(["equal", "custom"] as const).map((method) => (
          <button
            aria-checked={value === method}
            className={cn(
              "min-h-10 rounded-sm px-3 text-sm font-semibold transition",
              value === method
                ? "bg-surface-container-lowest text-primary-strong shadow-soft"
                : "text-muted hover:text-foreground",
            )}
            key={method}
            onClick={() => onChange(method)}
            role="radio"
            type="button"
          >
            {method === "equal" ? "Equal" : "Custom"}
          </button>
        ))}
      </div>
    </div>
  );
}
