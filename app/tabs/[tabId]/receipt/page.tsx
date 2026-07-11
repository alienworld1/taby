import { AppShell } from "@/components/shell/AppShell";
import { FinalTabReceiptContent } from "@/components/tabs/FinalTabReceiptContent";

type ReceiptPageProps = {
  params: Promise<{
    tabId: string;
  }>;
};

export async function generateMetadata({ params }: ReceiptPageProps) {
  await params;

  return {
    title: "Final Tab receipt",
  };
}

export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const { tabId } = await params;

  return (
    <AppShell eyebrow="Shared receipt" title="Final Tab receipt">
      <FinalTabReceiptContent tabId={tabId} />
    </AppShell>
  );
}
