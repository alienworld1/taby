import { AppShell } from "@/components/shell/AppShell";
import { DashboardContent } from "@/components/account/DashboardContent";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <AppShell eyebrow="Your tabs" title="Dashboard">
      <DashboardContent />
    </AppShell>
  );
}
