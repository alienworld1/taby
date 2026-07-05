import { cn } from "@/lib/cn";

type LoadingStateProps = {
  className?: string;
  label?: string;
  rows?: number;
};

export function LoadingState({
  className,
  label = "Loading your tab space",
  rows = 3,
}: LoadingStateProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn("rounded-md border border-outline-variant bg-surface-container-lowest p-5", className)}
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div className="mb-5 h-5 w-40 animate-pulse rounded-full bg-surface-container-high" />
      <div className="grid gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4"
            key={index}
          >
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-container-highest" />
            <div className="h-3 w-full animate-pulse rounded-full bg-surface-container-high" />
          </div>
        ))}
      </div>
    </div>
  );
}
