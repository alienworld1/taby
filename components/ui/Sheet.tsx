"use client";

import type { ReactNode } from "react";
import { FiX } from "react-icons/fi";
import { Button } from "@/components/ui/Button";

type SheetProps = {
  children: ReactNode;
  description?: string;
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
};

export function Sheet({
  children,
  description,
  open,
  title,
  onOpenChange,
}: SheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-40 grid items-end bg-inverse-surface/25 p-3 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
    >
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
            ) : null}
          </div>
          <Button
            aria-label="Close"
            className="size-10 rounded-full px-0"
            icon={<FiX aria-hidden="true" />}
            onClick={() => onOpenChange(false)}
            variant="ghost"
          >
            <span className="sr-only">Close</span>
          </Button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
