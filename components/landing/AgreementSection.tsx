import { FiCheck, FiLock, FiMinus } from "react-icons/fi";

const agreedExpenses = [
  ["Accommodation", "1,240.00"],
  ["Equipment hire", "286.40"],
  ["Local transport", "96.00"],
  ["Team dinner", "164.80"],
];

export function AgreementSection() {
  return (
    <section className="bg-primary-strong py-20 text-on-primary sm:py-28" id="agreement">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-primary-fixed">Agreement comes first</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-5xl">
              Only agreed expenses cross the line.
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-8 text-primary-fixed">
              A disputed item stays visible, but it never enters the Final Tab. The group settles the accepted state—not a guess, and not an unfinished conversation.
            </p>
          </div>

          <div className="relative grid gap-5 sm:grid-cols-[1fr_auto_0.56fr] sm:items-stretch">
            <div className="rounded-xl border border-primary-fixed/30 bg-surface-container-lowest p-5 text-foreground shadow-[0_24px_70px_rgba(0,0,0,0.16)] sm:p-6">
              <div className="flex items-center justify-between gap-4 border-b border-outline-variant pb-4">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-primary">Included</p>
                  <h3 className="mt-1 text-xl font-semibold">Agreed expenses</h3>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-strong">
                  <FiLock /> Final Tab
                </div>
              </div>
              <div className="divide-y divide-outline-variant">
                {agreedExpenses.map(([label, amount]) => (
                  <div className="flex items-center justify-between gap-3 py-3" key={label}>
                    <div className="flex items-center gap-2">
                      <FiCheck className="text-primary" />
                      <span className="font-medium">{label}</span>
                    </div>
                    <span className="font-mono text-xs text-muted">{amount}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-primary" />
            </div>

            <div className="hidden w-px bg-primary-fixed/50 sm:block" />

            <div className="self-center rounded-lg border border-coral/40 bg-coral-wash p-5 text-foreground sm:-rotate-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">Taxi</p>
                <FiMinus className="text-debtor" />
              </div>
              <p className="mt-2 font-mono text-xs text-muted">42.60 USDC</p>
              <div className="mt-5 border-t border-debtor/30 pt-3">
                <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.12em] text-debtor">Disputed · excluded</p>
                <p className="mt-2 text-sm leading-6 text-muted">This item stays out until the group resolves it.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
