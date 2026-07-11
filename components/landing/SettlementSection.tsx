import { FiCheckCircle } from "react-icons/fi";
import { SettlementFlowVisual } from "@/components/landing/SettlementFlowVisual";

export function SettlementSection() {
  return (
    <section className="border-y border-outline-variant bg-surface-container-low py-20 sm:py-28" id="settlement">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-primary">One collective execution</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-5xl">
            Two transfers close the whole tab.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted">
            Taby turns the group&apos;s accepted obligations into a simpler final settlement. Every transfer completes together—or none does.
          </p>
        </div>

        <div className="mt-12">
          <SettlementFlowVisual />
        </div>

        <div className="mx-auto mt-10 flex max-w-2xl items-start gap-3 rounded-lg border border-primary-fixed bg-surface-container-lowest p-4 text-sm leading-6 text-muted shadow-soft">
          <FiCheckCircle className="mt-1 shrink-0 text-primary" />
          <p>
            <strong className="text-foreground">Atomic by design.</strong> The group never lands in a half-settled state where one final transfer succeeds and another quietly fails.
          </p>
        </div>
      </div>
    </section>
  );
}
