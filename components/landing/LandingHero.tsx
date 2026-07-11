import { FiArrowDown, FiCheckCircle } from "react-icons/fi";
import { AuthActionButton } from "@/components/auth/AuthActionButton";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { FinalTabHeroVisual } from "@/components/landing/FinalTabHeroVisual";

export function LandingHero() {
  return (
    <section className="relative mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-7xl items-center gap-12 px-5 pb-16 pt-10 sm:px-8 sm:pb-20 lg:grid-cols-[0.82fr_1.18fr] lg:gap-8 lg:pb-24 lg:pt-12">
      <div className="relative z-10">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-primary">
          One agreement. One shared finish.
        </p>
        <h1 className="mt-5 max-w-3xl text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-foreground sm:text-7xl lg:text-[5.25rem]">
          Settle the whole tab together.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted sm:text-xl">
          Agree on what counts, approve one Final Tab, and close shared expenses in one safe flow.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <AuthActionButton size="lg">Create a tab</AuthActionButton>
          <ButtonLink href="#how-it-works" icon={<FiArrowDown aria-hidden="true" />} size="lg" variant="secondary">
            See how it works
          </ButtonLink>
        </div>
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <FiCheckCircle aria-hidden="true" className="text-primary" />
          No wallet installation, chain selection, or gas management.
        </p>
      </div>
      <FinalTabHeroVisual />
    </section>
  );
}
