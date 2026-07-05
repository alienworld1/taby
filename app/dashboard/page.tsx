import { FiPlusCircle } from "react-icons/fi";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { StatusChip } from "@/components/ui/StatusChip";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <AppShell eyebrow="Your tabs" title="Dashboard">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <EmptyState
          action={
            <div className="grid gap-2">
              <Button disabled icon={<FiPlusCircle aria-hidden="true" />}>
                Create your first tab
              </Button>
              <p className="max-w-xs text-sm text-muted">
                Sign in to create a tab with your group.
              </p>
            </div>
          }
          description="Start with one shared trip, dinner, or bill."
          icon={<FiPlusCircle aria-hidden="true" />}
          title="No tabs yet"
        />
        <div className="grid gap-5">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Sign in to open your tabs</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Your group tabs will appear here once sign-in is connected.
                </p>
              </div>
              <StatusChip tone="pending">Next</StatusChip>
            </div>
          </Card>
          <ErrorCallout message="Something got in the way. Try again." />
        </div>
      </div>
    </AppShell>
  );
}
