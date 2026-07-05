import { FiFileText } from "react-icons/fi";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReceiptBlock } from "@/components/ui/ReceiptBlock";

type ReceiptPageProps = {
  params: Promise<{
    tabId: string;
  }>;
};

export async function generateMetadata({ params }: ReceiptPageProps) {
  const { tabId } = await params;

  return {
    title: `Receipt ${tabId}`,
  };
}

export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const { tabId } = await params;

  return (
    <AppShell eyebrow={`Tab ${tabId}`} title="Receipt">
      <div className="grid gap-5">
        <EmptyState
          description="A clean receipt will appear here after a real tab is settled."
          icon={<FiFileText aria-hidden="true" />}
          title="No receipt yet"
        />
        <ReceiptBlock>
          <p>Receipt details will appear after settlement.</p>
        </ReceiptBlock>
      </div>
    </AppShell>
  );
}
