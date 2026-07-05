import { FiFileText } from "react-icons/fi";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";

type TabPageProps = {
  params: Promise<{
    tabId: string;
  }>;
};

export async function generateMetadata({ params }: TabPageProps) {
  const { tabId } = await params;

  return {
    title: `Tab ${tabId}`,
  };
}

export default async function TabPage({ params }: TabPageProps) {
  const { tabId } = await params;

  return (
    <AppShell eyebrow={`Tab ${tabId}`} title="Tab details">
      <EmptyState
        description="Sign in to open this tab and see the expenses your group has confirmed."
        icon={<FiFileText aria-hidden="true" />}
        title="Sign in to open your tabs"
      />
    </AppShell>
  );
}
