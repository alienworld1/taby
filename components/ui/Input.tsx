import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
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

export function Input({
  className,
  error,
  helperText,
  id,
  label,
  name,
  required,
  ...props
}: InputProps) {
  const inputId = id || fallbackId(label, name);
  const descriptionId = `${inputId}-description`;

  return (
    <label className="grid gap-2 text-sm font-semibold text-foreground" htmlFor={inputId}>
      <span>
        {label}
        {required ? <span className="text-secondary"> *</span> : null}
      </span>
      <input
        aria-describedby={helperText || error ? descriptionId : undefined}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "min-h-11 rounded-md border bg-surface-container-lowest px-3 text-base text-foreground transition placeholder:text-muted/70 disabled:cursor-not-allowed disabled:bg-surface-container",
          error ? "border-error" : "border-outline-variant focus:border-primary",
          className,
        )}
        id={inputId}
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
