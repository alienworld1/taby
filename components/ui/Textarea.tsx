import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string;
  helperText?: string;
  label: string;
};

function fallbackId(label: string, name?: string) {
  return (
    name ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}

export function Textarea({
  className,
  error,
  helperText,
  id,
  label,
  name,
  required,
  ...props
}: TextareaProps) {
  const textareaId = id || fallbackId(label, name);
  const descriptionId = `${textareaId}-description`;

  return (
    <label className="grid gap-2 text-sm font-semibold text-foreground" htmlFor={textareaId}>
      <span>
        {label}
        {required ? <span className="text-secondary"> *</span> : null}
      </span>
      <textarea
        aria-describedby={helperText || error ? descriptionId : undefined}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "min-h-28 resize-y rounded-md border bg-surface-container-lowest px-3 py-2 text-base text-foreground transition placeholder:text-muted/70 disabled:cursor-not-allowed disabled:bg-surface-container",
          error ? "border-error" : "border-outline-variant focus:border-primary",
          className,
        )}
        id={textareaId}
        name={name}
        required={required}
        {...props}
      />
      {helperText || error ? (
        <span
          className={cn("text-sm font-normal", error ? "text-error" : "text-muted")}
          id={descriptionId}
        >
          {error || helperText}
        </span>
      ) : null}
    </label>
  );
}
