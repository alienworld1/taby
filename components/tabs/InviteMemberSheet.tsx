"use client";

import { useState, type FormEvent } from "react";
import { FiUserPlus } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import type { TabClientError } from "@/lib/tabs/client";

type InviteMemberSheetProps = {
  error: TabClientError | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (email: string) => Promise<boolean>;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string) {
  const trimmed = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(trimmed)) {
    return "Enter a valid email address.";
  }

  return null;
}

export function InviteMemberSheet({
  error,
  loading,
  open,
  onOpenChange,
  onSubmit,
}: InviteMemberSheetProps) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();

  function closeSheet() {
    setEmail("");
    setFieldError(undefined);
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = validate(email);
    setFieldError(nextError ?? undefined);

    if (nextError) {
      return;
    }

    const ok = await onSubmit(email.trim().toLowerCase());

    if (ok) {
      setEmail("");
      setFieldError(undefined);
    }
  }

  return (
    <Sheet
      description="Invite someone who already has a Taby account."
      open={open}
      title="Invite a member"
      onOpenChange={loading ? () => undefined : closeSheet}
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        {error ? <ErrorCallout message={error.message} title="We could not send that invite" /> : null}
        <Input
          autoComplete="email"
          disabled={loading}
          error={fieldError}
          inputMode="email"
          label="Email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="mira@example.com"
          required
          type="email"
          value={email}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={closeSheet} variant="secondary">
            Cancel
          </Button>
          <Button icon={<FiUserPlus aria-hidden="true" />} loading={loading} type="submit">
            {loading ? "Sending invite" : "Send invite"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
