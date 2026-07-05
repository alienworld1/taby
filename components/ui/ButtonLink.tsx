import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonLinkVariant = "primary" | "secondary" | "ghost";
type ButtonLinkSize = "md" | "lg";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  size?: ButtonLinkSize;
  variant?: ButtonLinkVariant;
};

const variantClasses: Record<ButtonLinkVariant, string> = {
  primary:
    "bg-primary text-on-primary shadow-soft hover:bg-primary-strong active:bg-primary-strong",
  secondary:
    "border border-outline-variant bg-surface-container-lowest text-foreground hover:border-outline hover:bg-surface-container-low",
  ghost: "text-muted hover:bg-surface-container-low hover:text-foreground",
};

const sizeClasses: Record<ButtonLinkSize, string> = {
  md: "min-h-11 px-4 text-base",
  lg: "min-h-12 px-5 text-base",
};

export function ButtonLink({
  children,
  className,
  icon,
  size = "md",
  variant = "primary",
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
