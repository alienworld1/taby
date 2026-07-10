"use client";

import { useState } from "react";
import { FiCheckCircle, FiHash } from "react-icons/fi";
import { shortHash } from "@/components/tabs/proposalUtils";

type ProposalHashRowProps = {
  hash: string;
};

export function ProposalHashRow({ hash }: ProposalHashRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-outline-variant bg-surface-container-low px-4 py-3">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted">
          <FiHash aria-hidden="true" className="shrink-0" />
          Final Tab hash
        </span>
        <span className="font-mono text-xs text-foreground">{shortHash(hash)}</span>
      </button>
      {expanded ? (
        <div className="mt-3 flex items-start gap-2 border-t border-outline-variant pt-3">
          <FiCheckCircle aria-hidden="true" className="mt-0.5 shrink-0 text-primary-strong" />
          <p className="break-all font-mono text-xs leading-5 text-muted">{hash}</p>
        </div>
      ) : null}
    </div>
  );
}
