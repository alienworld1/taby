"use client";

import { useState, type FormEvent } from "react";
import { FiPlusCircle } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { Textarea } from "@/components/ui/Textarea";
import type { TabClientError } from "@/lib/tabs/client";

type CreateTabSheetProps = {
  error: TabClientError | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { description?: string; title: string }) => Promise<boolean>;
};

type FieldErrors = {
  description?: string;
  title?: string;
};

function validate(title: string, description: string) {
  const errors: FieldErrors = {};
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();

  if (trimmedTitle.length < 2) {
    errors.title = "Use at least 2 characters.";
  } else if (trimmedTitle.length > 80) {
    errors.title = "Keep this under 80 characters.";
  }

  if (trimmedDescription.length > 240) {
    errors.description = "Keep this under 240 characters.";
  }

  return errors;
}

export function CreateTabSheet({
  error,
  loading,
  open,
  onOpenChange,
  onSubmit,
}: CreateTabSheetProps) {
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [title, setTitle] = useState("");

  function closeSheet() {
    setFieldErrors({});
    setTitle("");
    setDescription("");
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(title, description);
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const trimmedDescription = description.trim();
    const ok = await onSubmit({
      description: trimmedDescription || undefined,
      title: title.trim(),
    });

    if (ok) {
      setTitle("");
      setDescription("");
      setFieldErrors({});
    }
  }

  return (
    <Sheet
      description="Name the shared tab your group will settle together."
      open={open}
      title="Create a tab."
      onOpenChange={loading ? () => undefined : closeSheet}
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        {error ? <ErrorCallout message={error.message} title="We could not create that tab" /> : null}
        <Input
          autoComplete="off"
          disabled={loading}
          error={fieldErrors.title}
          label="Tab name"
          maxLength={80}
          name="title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Goa Weekend."
          required
          value={title}
        />
        <Textarea
          disabled={loading}
          error={fieldErrors.description}
          label="Description"
          maxLength={240}
          name="description"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Stay, taxis, and meals."
          value={description}
        />
        <p className="text-sm leading-6 text-muted">
          Settlement will use USDC when this tab is ready.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} onClick={closeSheet} variant="secondary">
            Cancel
          </Button>
          <Button
            icon={<FiPlusCircle aria-hidden="true" />}
            loading={loading}
            type="submit"
          >
            {loading ? "Creating tab" : "Create tab"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
