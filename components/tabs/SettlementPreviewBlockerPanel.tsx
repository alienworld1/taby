"use client";

import { FiAlertCircle, FiRefreshCcw } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import type { SettlementPreviewBlocker } from "@/lib/tabs/types";

type SettlementPreviewBlockerPanelProps = {
  blockers: SettlementPreviewBlocker[];
  loading?: boolean;
  onRetry: () => void;
};

export function SettlementPreviewBlockerPanel({
  blockers,
  loading = false,
  onRetry,
}: SettlementPreviewBlockerPanelProps) {
  if (blockers.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="rounded-md border border-secondary-soft bg-secondary-soft/45 p-4 text-secondary"
      role="status"
    >
      <div className="flex gap-3">
        <FiAlertCircle aria-hidden="true" className="mt-1 shrink-0" />
        <div className="min-w-0">
          <h3 className="font-semibold">Preview paused</h3>
          <ul className="mt-2 grid gap-2 text-sm leading-6">
            {blockers.map((blocker) => (
              <li className="break-words" key={blocker.id}>
                {blocker.message}
              </li>
            ))}
          </ul>
          <Button
            className="mt-4"
            icon={<FiRefreshCcw aria-hidden="true" />}
            loading={loading}
            onClick={onRetry}
            variant="secondary"
          >
            Refresh preview
          </Button>
        </div>
      </div>
    </div>
  );
}
