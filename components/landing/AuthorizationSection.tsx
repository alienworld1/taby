import { FiClock, FiLock, FiRefreshCw, FiShield } from "react-icons/fi";

const authorizationTerms = [
  { icon: FiLock, label: "Applies to", value: "This Final Tab only" },
  { icon: FiClock, label: "Expires", value: "Tonight, 11:59 PM" },
  { icon: FiRefreshCw, label: "Before settlement", value: "Revoke anytime" },
];

export function AuthorizationSection() {
  return (
    <section className="py-20 sm:py-28" id="authorization">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-24">
        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-8 -z-10 rounded-full bg-primary-wash blur-3xl" />
          <div className="rounded-2xl border border-primary-fixed bg-surface-container-lowest p-5 shadow-[0_24px_70px_rgba(15,76,68,0.12)] sm:p-8">
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant pb-6">
              <div>
                <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary">Your approval</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Review your exact part</h3>
              </div>
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <FiShield className="text-xl" />
              </div>
            </div>
            <div className="py-7">
              <p className="text-sm text-muted">Your maximum amount</p>
              <p className="mt-2 font-mono text-4xl font-semibold tracking-[-0.04em] text-primary-strong sm:text-5xl">18.40 USDC</p>
            </div>
            <div className="divide-y divide-outline-variant border-y border-outline-variant">
              {authorizationTerms.map((term) => {
                const Icon = term.icon;

                return (
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-4" key={term.label}>
                    <Icon className="row-span-2 mt-0.5 text-primary" />
                    <span className="text-xs text-muted">{term.label}</span>
                    <span className="font-mono text-sm font-medium">{term.value}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 rounded-2xl bg-primary px-5 py-3 text-center font-semibold text-on-primary">
              Approve 18.40 USDC
            </div>
          </div>
        </div>

        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-primary">Your amount. Your control.</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-5xl">
            Permission that ends where your obligation ends.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            Each person approves only their part of one locked Final Tab. The amount is capped, the approval expires, and it can be revoked before settlement.
          </p>
          <p className="mt-8 border-l-2 border-coral pl-5 text-base font-semibold leading-7 text-primary-strong">
            No unlimited approval. No ambiguous request. No change can reuse an old authorization.
          </p>
        </div>
      </div>
    </section>
  );
}
