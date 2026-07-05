import { FiArrowDown } from "react-icons/fi";
import { AuthActionButton } from "@/components/auth/AuthActionButton";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { LandingPreview } from "@/components/landing/LandingPreview";

export function LandingHero() {
  return (
    <section className="mx-auto grid min-h-[92vh] w-full max-w-6xl items-center gap-10 px-5 pb-10 pt-6 sm:px-8 lg:grid-cols-[1fr_0.92fr]">
      <div>
        <header className="mb-16 flex items-center justify-between gap-4 lg:mb-20">
          <a className="text-xl font-bold text-primary-strong" href="#main-content">
            Taby
          </a>
          <ButtonLink href="/dashboard" size="md" variant="secondary">
            Open app
          </ButtonLink>
        </header>
        <p className="font-mono text-xs font-medium uppercase text-muted">Shared tabs, finished cleanly</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.06] text-foreground sm:text-6xl">
          The shared tab that settles itself.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
          Add expenses together. Confirm them together. Settle the tab cleanly.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <AuthActionButton size="lg">Create a tab</AuthActionButton>
          <ButtonLink href="#how-it-works" icon={<FiArrowDown aria-hidden="true" />} size="lg" variant="secondary">
            See how it works
          </ButtonLink>
        </div>
      </div>
      <LandingPreview />
    </section>
  );
}
