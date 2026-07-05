"use client";

import { FiTrash2 } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Sheet } from "@/components/ui/Sheet";
import type { TabClientError } from "@/lib/tabs/client";

type RemoveExpenseSheetProps = {
  error: TabClientError | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
};

export function RemoveExpenseSheet({
  error,
  loading,
  open,
  onOpenChange,
  onSubmit,
}: RemoveExpenseSheetProps) {
  return (
    <Sheet
      description="This removes it from the tab. Add a new expense if the split needs to change."
      open={open}
      title="Remove this expense?"
      onOpenChange={onOpenChange}
    >
      <div className="grid gap-4">
        {error ? (
          <ErrorCallout message={error.message} title="We could not remove this expense" />
        ) : null}
        <div className="flex justify-end gap-3">
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button
            icon={<FiTrash2 aria-hidden="true" />}
            loading={loading}
            onClick={onSubmit}
            variant="danger"
          >
            Remove expense
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
