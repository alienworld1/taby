"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { FiAlertCircle } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Sheet } from "@/components/ui/Sheet";
import { Textarea } from "@/components/ui/Textarea";
import type { TabClientError } from "@/lib/tabs/client";

type DisputeExpenseSheetProps = {
  error: TabClientError | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<boolean>;
};

export function DisputeExpenseSheet({
  error,
  loading,
  open,
  onOpenChange,
  onSubmit,
}: DisputeExpenseSheetProps) {
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();

    if (trimmed.length > 240) {
      setFieldError("Keep the reason under 240 characters.");
      return;
    }

    const saved = await onSubmit(trimmed);

    if (saved) {
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={open} title="Dispute this expense" onOpenChange={onOpenChange}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        {error ? (
          <ErrorCallout message={error.message} title="We could not submit this dispute" />
        ) : null}
        <Textarea
          error={fieldError ?? undefined}
          helperText="Keep it short and useful for the group."
          label="Reason"
          maxLength={240}
          onChange={(event) => {
            setReason(event.target.value);
            setFieldError(null);
          }}
          value={reason}
        />
        <div className="flex justify-end gap-3">
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button icon={<FiAlertCircle aria-hidden="true" />} loading={loading} type="submit">
            {loading ? "Submitting dispute" : "Submit dispute"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
