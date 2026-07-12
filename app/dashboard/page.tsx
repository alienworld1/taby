import { AppShell } from "@/components/shell/AppShell";
import { DashboardContent } from "@/components/account/DashboardContent";

export const metadata = {
  title: "Your tabs",
};

export default function DashboardPage() {
  return (
    <AppShell createActionLabel="Create tab" eyebrow="Shared agreements" title="Your tabs">
      <DashboardContent />
    </AppShell>
  );
}
