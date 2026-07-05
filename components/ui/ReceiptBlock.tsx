import type { ReactNode } from "react";

type ReceiptBlockProps = {
  children: ReactNode;
  label?: string;
};

export function ReceiptBlock({ children, label = "Receipt details" }: ReceiptBlockProps) {
  return (
    <section className="rounded-md border border-outline-variant bg-surface-container-low p-4">
      <h2 className="font-mono text-xs font-medium uppercase text-muted">{label}</h2>
      <div className="mt-3 overflow-x-auto rounded-md bg-surface-container-lowest p-4 font-mono text-sm leading-6 text-muted">
        {children}
      </div>
    </section>
  );
}
