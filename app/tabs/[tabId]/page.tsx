import { AppShell } from "@/components/shell/AppShell";
import { TabDetailContent } from "@/components/tabs/TabDetailContent";

type TabPageProps = {
  params: Promise<{
    tabId: string;
  }>;
};

export async function generateMetadata({ params }: TabPageProps) {
  await params;
  return {
    title: "Tab details",
  };
}

export default async function TabPage({ params }: TabPageProps) {
  const { tabId } = await params;

  return (
    <AppShell createActionLabel="Create tab" eyebrow="Shared tab" title="Tab details">
      <TabDetailContent tabId={tabId} />
    </AppShell>
  );
}
