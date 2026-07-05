import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHero } from "@/components/landing/LandingHero";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main id="main-content">
        <LandingHero />
        <HowItWorksSection />
      </main>
      <LandingFooter />
    </div>
  );
}
