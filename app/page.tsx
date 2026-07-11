import { AgreementSection } from "@/components/landing/AgreementSection";
import { AuthorizationSection } from "@/components/landing/AuthorizationSection";
import { GroupContextSection } from "@/components/landing/GroupContextSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { ReceiptSection } from "@/components/landing/ReceiptSection";
import { SettlementSection } from "@/components/landing/SettlementSection";

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <LandingHeader />
      <main id="main-content">
        <LandingHero />
        <GroupContextSection />
        <AgreementSection />
        <AuthorizationSection />
        <SettlementSection />
        <ReceiptSection />
      </main>
      <LandingFooter />
    </div>
  );
}
