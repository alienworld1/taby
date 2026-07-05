import { FiSettings } from "react-icons/fi";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReceiptBlock } from "@/components/ui/ReceiptBlock";
import { StatusChip } from "@/components/ui/StatusChip";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <AppShell eyebrow="Account" title="Settings">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <EmptyState
          description="Sign in to manage your profile and tab preferences."
          icon={<FiSettings aria-hidden="true" />}
          title="Sign in to open settings"
        />
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Technical details stay secondary</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                When receipts and account details arrive, they will live behind clear labels.
              </p>
            </div>
            <StatusChip>Quiet</StatusChip>
          </div>
          <div className="mt-5">
            <ReceiptBlock label="Future receipt area">
              <p>No account details are available yet.</p>
            </ReceiptBlock>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
