import type { ReactNode } from "react";

type AuthorizationDetailRowProps = {
  icon?: ReactNode;
  label: string;
  strong?: boolean;
  value: string;
};

export function AuthorizationDetailRow({
  icon,
  label,
  strong = false,
  value,
}: AuthorizationDetailRowProps) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-outline-variant/70 pb-3 last:border-b-0 last:pb-0">
      <span className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </span>
      <span
        className={
          strong
            ? "text-right text-base font-semibold text-foreground"
            : "text-right text-sm font-semibold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
