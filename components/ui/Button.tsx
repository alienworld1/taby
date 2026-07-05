import type { ButtonHTMLAttributes, ReactNode } from "react";
import { FiLoader } from "react-icons/fi";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-soft hover:bg-primary-strong active:bg-primary-strong",
  secondary:
    "border border-outline-variant bg-surface-container-lowest text-foreground hover:border-outline hover:bg-surface-container-low",
  ghost: "text-muted hover:bg-surface-container-low hover:text-foreground",
  danger:
    "bg-error-container text-on-error-container hover:bg-secondary-soft active:bg-secondary-soft",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-base",
  lg: "min-h-12 px-5 text-base",
};

export function Button({
  className,
  children,
  disabled,
  icon,
  loading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <FiLoader aria-hidden="true" className="animate-spin" /> : icon}
      <span>{children}</span>
    </button>
  );
}
