import { BrandMark } from "@/components/brand/BrandMark";

export function LandingFooter() {
  return (
    <footer className="border-t border-outline-variant bg-surface-container-lowest">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <a className="inline-flex shrink-0" href="#main-content">
          <BrandMark className="h-8 w-auto" variant="wordmark" />
        </a>
        <p>For groups that want shared expenses fully finished.</p>
        <a className="font-semibold text-primary hover:text-primary-strong" href="#how-it-works">
          How it works
        </a>
      </div>
    </footer>
  );
}
