"use client";

import { FiCheckCircle, FiClock } from "react-icons/fi";

const steps = ["Members added", "Expenses next", "Confirm together", "Settle"];

export function SetupProgressStrip() {
  return (
    <section
      aria-label="Tab setup progress"
      className="rounded-md border border-outline-variant bg-surface-container-lowest p-4 shadow-soft"
    >
      <div className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const isCurrent = index === 0;
          const Icon = isCurrent ? FiCheckCircle : FiClock;

          return (
            <span
              className={
                isCurrent
                  ? "inline-flex min-h-8 items-center gap-2 rounded-full bg-primary-soft px-3 text-sm font-semibold text-primary-strong"
                  : "inline-flex min-h-8 items-center gap-2 rounded-full bg-surface-container px-3 text-sm font-semibold text-muted"
              }
              key={step}
            >
              <Icon aria-hidden="true" />
              {step}
            </span>
          );
        })}
      </div>
    </section>
  );
}
