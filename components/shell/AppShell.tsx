import Link from "next/link";
import type { ReactNode } from "react";
import { FiPlusCircle } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { appNavigation } from "@/lib/navigation";

type AppShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
};

export function AppShell({ children, eyebrow, title }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-outline-variant bg-surface-container-lowest/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link className="text-xl font-bold text-primary-strong" href="/">
            Taby
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            {appNavigation.map((item) => {
              const Icon = item.icon;

              if (item.disabled) {
                return (
                  <Button
                    aria-disabled="true"
                    className="hidden min-h-10 cursor-not-allowed rounded-full px-3 text-sm text-muted opacity-60 sm:inline-flex"
                    disabled
                    icon={Icon ? <Icon aria-hidden="true" /> : null}
                    key={item.label}
                    title="Create a real tab in the next step"
                    type="button"
                    variant="ghost"
                  >
                    {item.label}
                  </Button>
                );
              }

              return (
                <Link
                  className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted transition hover:bg-surface-container-low hover:text-foreground"
                  href={item.href}
                  key={item.label}
                >
                  {Icon ? <Icon aria-hidden="true" /> : null}
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8" id="main-content">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            {eyebrow ? (
              <p className="font-mono text-xs font-medium uppercase text-muted">{eyebrow}</p>
            ) : null}
            <h1 className="mt-2 text-3xl font-semibold leading-10 text-foreground">{title}</h1>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StatusChip tone="pending">Sign-in comes next</StatusChip>
            <Button
              disabled
              icon={<FiPlusCircle aria-hidden="true" />}
              title="Create a real tab after sign-in is connected"
            >
              Create your first tab
            </Button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
