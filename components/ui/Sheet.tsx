"use client";

import { useId, type ReactNode } from "react";
import { FiX } from "react-icons/fi";
import { cn } from "@/lib/cn";

type SheetProps = {
  children: ReactNode;
  description?: string;
  open: boolean;
  panelClassName?: string;
  title: string;
  onOpenChange: (open: boolean) => void;
};

export function Sheet({
  children,
  description,
  open,
  panelClassName,
  title,
  onOpenChange,
}: SheetProps) {
  const titleId = useId();
  const descriptionId = useId();

  if (!open) {
    return null;
  }

  return (
    <div
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-40 grid items-end bg-inverse-surface/25 p-3 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
    >
      <div
        className={cn(
          "mx-auto w-full max-w-lg rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-soft",
          panelClassName,
        )}
      >
        <div className="relative min-h-10 pr-12">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold leading-7" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close"
            className="absolute right-0 top-0 z-10 grid size-11 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest text-foreground shadow-soft transition hover:border-outline hover:bg-surface-container-low"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <FiX aria-hidden="true" className="size-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
