import { SettingsContent } from "@/components/account/SettingsContent";
import { AppShell } from "@/components/shell/AppShell";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <AppShell eyebrow="Account" title="Settings">
      <SettingsContent />
    </AppShell>
  );
}
