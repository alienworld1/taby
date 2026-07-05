import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
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

export function Select({
  children,
  className,
  error,
  helperText,
  id,
  label,
  name,
  required,
  ...props
}: SelectProps) {
  const selectId = id || fallbackId(label, name);
  const descriptionId = `${selectId}-description`;

  return (
    <label className="grid gap-2 text-sm font-semibold text-foreground" htmlFor={selectId}>
      <span>
        {label}
        {required ? <span className="text-secondary"> *</span> : null}
      </span>
      <select
        aria-describedby={helperText || error ? descriptionId : undefined}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "min-h-11 rounded-md border bg-surface-container-lowest px-3 text-base text-foreground transition disabled:cursor-not-allowed disabled:bg-surface-container",
          error ? "border-error" : "border-outline-variant focus:border-primary",
          className,
        )}
        id={selectId}
        name={name}
        required={required}
        {...props}
      >
        {children}
      </select>
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
