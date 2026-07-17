import { ButtonLink } from "@/components/ui/ButtonLink";
import { BrandMark } from "@/components/brand/BrandMark";

export function LandingHeader() {
  return (
    <header className="relative z-30 border-b border-outline-variant bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <a className="inline-flex shrink-0" href="#main-content">
          <BrandMark className="h-10 w-auto" variant="wordmark" />
        </a>
        <nav aria-label="Landing page" className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
          <a className="transition hover:text-foreground" href="#agreement">
            Agreement
          </a>
          <a className="transition hover:text-foreground" href="#authorization">
            Your control
          </a>
          <a className="transition hover:text-foreground" href="#settlement">
            Settlement
          </a>
        </nav>
        <ButtonLink href="/dashboard" size="md" variant="secondary">
          Open app
        </ButtonLink>
      </div>
    </header>
  );
}
