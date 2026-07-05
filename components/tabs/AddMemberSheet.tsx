"use client";

import { useState, type FormEvent } from "react";
import { FiUserPlus } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import type { TabClientError } from "@/lib/tabs/client";
import type { TabMemberResponse } from "@/lib/tabs/types";

type AddMemberSheetProps = {
  error: TabClientError | null;
  loading: boolean;
  members: TabMemberResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (displayName: string) => Promise<boolean>;
};

function validate(displayName: string, members: TabMemberResponse[]) {
  const trimmed = displayName.trim();

  if (trimmed.length < 2) {
    return "Use at least 2 characters.";
  }

  if (trimmed.length > 40) {
    return "Keep this under 40 characters.";
  }

  const normalized = trimmed.toLowerCase();
  const duplicate = members.some(
    (member) => member.joinStatus !== "removed" && member.displayName.trim().toLowerCase() === normalized,
  );

  if (duplicate) {
    return "That name is already in this tab.";
  }

  return null;
}

export function AddMemberSheet({
  error,
  loading,
  members,
  open,
  onOpenChange,
  onSubmit,
}: AddMemberSheetProps) {
  const [displayName, setDisplayName] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();

  function closeSheet() {
    setDisplayName("");
    setFieldError(undefined);
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = validate(displayName, members);
    setFieldError(nextError ?? undefined);

    if (nextError) {
      return;
    }

    const ok = await onSubmit(displayName.trim());

    if (ok) {
      setDisplayName("");
      setFieldError(undefined);
    }
  }

  return (
    <Sheet
      description="Add the people who should review expenses in this tab."
      open={open}
      title="Add a member."
      onOpenChange={loading ? () => undefined : closeSheet}
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        {error ? <ErrorCallout message={error.message} title="We could not add that member" /> : null}
        <Input
          autoComplete="name"
          disabled={loading}
          error={fieldError}
          label="Name"
          maxLength={40}
          name="displayName"
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Mira."
          required
          value={displayName}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={closeSheet} variant="secondary">
            Cancel
          </Button>
          <Button icon={<FiUserPlus aria-hidden="true" />} loading={loading} type="submit">
            {loading ? "Adding member" : "Add member"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
