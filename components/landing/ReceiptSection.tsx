import { FiArrowRight, FiCheck, FiExternalLink } from "react-icons/fi";
import { AuthActionButton } from "@/components/auth/AuthActionButton";

const receiptLines = [
  ["Expenses included", "6"],
  ["Dispute excluded", "1"],
  ["Transfers completed", "2"],
  ["Total settled", "86.20 USDC"],
];

export function ReceiptSection() {
  return (
    <section className="relative overflow-hidden bg-primary-strong py-20 text-on-primary sm:py-28" id="how-it-works">
      <div className="absolute left-1/2 top-0 h-20 w-px bg-primary-fixed/50" />
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-24">
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-primary-fixed">One shared receipt</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
            Everyone leaves with the same answer.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-primary-fixed">
            The group sees what counted, what stayed out, what moved, and whether the whole Final Tab completed. Technical proof remains available without taking over the experience.
          </p>
          <div className="mt-9">
            <p className="text-xl font-semibold">Ready to close the tab?</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <AuthActionButton className="bg-on-primary text-primary-strong hover:bg-primary-wash" size="lg">
                Create a tab
              </AuthActionButton>
              <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-primary-fixed/50 px-5 font-semibold text-on-primary transition hover:bg-primary" href="#agreement">
                Review the flow <FiArrowRight />
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-xl rounded-xl bg-surface-container-lowest p-5 text-foreground shadow-[0_28px_90px_rgba(0,0,0,0.24)] sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant pb-6">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <span className="grid size-7 place-items-center rounded-full bg-coral text-on-primary"><FiCheck /></span>
                <p className="font-mono text-xs font-medium uppercase tracking-[0.12em]">Complete</p>
              </div>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">Final Tab settled</h3>
            </div>
            <p className="font-mono text-xs text-muted">TAB / 04</p>
          </div>
          <div className="divide-y divide-outline-variant py-2">
            {receiptLines.map(([label, value]) => (
              <div className="flex items-center justify-between gap-4 py-4" key={label}>
                <span className="text-muted">{label}</span>
                <span className="font-mono text-sm font-semibold">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-primary-wash px-4 py-3 text-sm text-primary-strong">
            <span className="font-semibold">Verified settlement</span>
            <span className="flex items-center gap-1.5 font-mono text-xs">View proof <FiExternalLink /></span>
          </div>
          <div className="mx-auto mt-7 h-2 w-20 rounded-full bg-coral shadow-[0_0_24px_rgba(255,127,94,0.5)]" />
        </div>
      </div>
    </section>
  );
}
