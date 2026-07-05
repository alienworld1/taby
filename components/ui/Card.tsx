import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "plain" | "soft" | "tinted";
};

const toneClasses: Record<NonNullable<CardProps["tone"]>, string> = {
  plain: "border-outline-variant bg-surface-container-lowest",
  soft: "border-outline-variant bg-surface-container-low",
  tinted: "border-primary-fixed bg-primary-soft",
};

export function Card({
  className,
  tone = "plain",
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-md border p-5 shadow-soft",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
