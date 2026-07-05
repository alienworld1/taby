import { FiCheck, FiFileText, FiPlus, FiRefreshCw } from "react-icons/fi";
import { Card } from "@/components/ui/Card";

const steps = [
  {
    description: "Capture the shared dinner, trip, bill, or stay while everyone still remembers it.",
    icon: FiPlus,
    title: "Add",
  },
  {
    description: "Everyone sees what counts before a balance becomes final.",
    icon: FiCheck,
    title: "Confirm",
  },
  {
    description: "Taby compresses messy IOUs into the few transfers that finish the tab.",
    icon: FiRefreshCw,
    title: "Settle",
  },
  {
    description: "The group gets one calm finish state with the proof tucked behind the receipt.",
    icon: FiFileText,
    title: "Receipt",
  },
];

export function HowItWorksSection() {
  return (
    <section
      className="border-y border-outline-variant bg-surface-container-low py-16 sm:py-20"
      id="how-it-works"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase text-muted">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold leading-10">
            Built for the moment when the group wants the money part to be over.
          </h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon;

            return (
              <Card className="p-5" key={step.title}>
                <div className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary">
                  <Icon aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
