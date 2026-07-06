"use client";

import { FiXCircle } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Sheet } from "@/components/ui/Sheet";
import type { TabClientError } from "@/lib/tabs/client";

type CancelProposalSheetProps = {
  error: TabClientError | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
};

export function CancelProposalSheet({
  error,
  loading,
  open,
  onOpenChange,
  onSubmit,
}: CancelProposalSheetProps) {
  return (
    <Sheet
      description="This returns included expenses to review so your group can update the tab and create a fresh proposal."
      open={open}
      title="Cancel this proposal?"
      onOpenChange={onOpenChange}
    >
      <div className="grid gap-4">
        {error ? (
          <ErrorCallout message={error.message} title="We could not cancel the proposal" />
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Keep proposal
          </Button>
          <Button
            icon={<FiXCircle aria-hidden="true" />}
            loading={loading}
            onClick={onSubmit}
            variant="danger"
          >
            Cancel proposal
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
