import { FiArrowRight, FiCreditCard, FiGlobe, FiUsers } from "react-icons/fi";

const members = [
  { initials: "ML", location: "Lisbon", name: "Mira" },
  { initials: "LN", location: "Berlin", name: "Leo" },
  { initials: "CS", location: "São Paulo", name: "Camila" },
  { initials: "NB", location: "New York", name: "Noah" },
];

export function GroupContextSection() {
  return (
    <section className="border-y border-outline-variant bg-surface-container-lowest py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-20">
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-primary">Built for distributed groups</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-5xl">
            The balances are known. The group still isn&apos;t finished.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            When a project team pays with different cards, currencies, and local payment apps, calculating the split is only half the work. Someone still has to reconcile every repayment.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-background shadow-soft">
          <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 font-semibold">
          <FiUsers className="text-primary" /> Project team
            </div>
            <span className="font-mono text-xs text-muted">4 members</span>
          </div>
          <div className="divide-y divide-outline-variant">
            {members.map((member) => (
              <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6" key={member.name}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-strong">
                    {member.initials}
                  </span>
                  <div>
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-sm text-muted">{member.location}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs text-muted">
                  <FiCreditCard /> Local payment app
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 bg-primary-strong px-5 py-5 text-on-primary sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-2">
              <FiGlobe />
              <span className="font-semibold">No payment app shared by everyone</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-primary-fixed">
              One common settlement <FiArrowRight />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
