"use client";

import { FiPlusCircle } from "react-icons/fi";
import { motion } from "motion/react";
import { useAuth } from "@/components/auth/useAuth";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { LoadingState } from "@/components/ui/LoadingState";
import { accountErrorMessage } from "@/lib/account/messages";

export function DashboardContent() {
  const { errorCode, retryAccountSetup, status } = useAuth();

  if (status === "initializing" || status === "onboarding") {
    return <LoadingState label="Getting your Taby account ready" rows={3} />;
  }

  if (status === "error" && errorCode) {
    return (
      <ErrorCallout
        action={<Button onClick={retryAccountSetup}>Try again</Button>}
        message={accountErrorMessage(errorCode)}
      />
    );
  }

  if (status !== "signedIn") {
    return (
      <SignInPrompt
        description="Use your email to keep your shared tabs and settlement wallet ready."
        title="Sign in to open your tabs."
      />
    );
  }

  return (
    <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 8 }}>
      <EmptyState
        action={
          <div className="grid gap-2">
            <Button disabled icon={<FiPlusCircle aria-hidden="true" />}>
              Create your first tab
            </Button>
            <p className="max-w-xs text-sm text-muted">Tab creation comes next.</p>
          </div>
        }
        description="Create a shared tab for one trip, dinner, or bill. Tab creation comes next."
        icon={<FiPlusCircle aria-hidden="true" />}
        title="No tabs yet."
      />
    </motion.div>
  );
}
