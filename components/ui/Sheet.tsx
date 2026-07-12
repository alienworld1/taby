"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { FiX } from "react-icons/fi";
import { cn } from "@/lib/cn";

type SheetProps = {
  children: ReactNode;
  description?: string;
  open: boolean;
  panelClassName?: string;
  preventClose?: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
};

export function Sheet({
  children,
  description,
  open,
  panelClassName,
  preventClose = false,
  title,
  onOpenChange,
}: SheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      openerRef.current?.focus();
      openerRef.current = null;
      return;
    }

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function requestClose() {
    if (!preventClose) {
      onOpenChange(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("hidden"));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-40 grid items-end bg-inverse-surface/25 p-3 backdrop-blur-md sm:items-center sm:p-6"
      onKeyDown={handleKeyDown}
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
            className="absolute right-0 top-0 z-10 grid size-11 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest text-foreground shadow-soft transition hover:border-outline hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-55"
            disabled={preventClose}
            onClick={requestClose}
            ref={closeButtonRef}
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
