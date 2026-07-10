"use client";

import { motion } from "motion/react";
import { FiCheckCircle, FiMail, FiRefreshCw } from "react-icons/fi";
import { useAuth } from "@/components/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { LoadingState } from "@/components/ui/LoadingState";
import { Sheet } from "@/components/ui/Sheet";
import { StatusChip } from "@/components/ui/StatusChip";
import { accountErrorMessage } from "@/lib/account/messages";

export function SignInSheet() {
  const {
    account,
    closeSignIn,
    errorCode,
    isSignInOpen,
    magicReady,
    retryAccountSetup,
    signIn,
    status,
  } = useAuth();
  const isBusy = status === "initializing" || status === "onboarding";

  return (
    <Sheet
      description="Use your email to keep your tabs and settlement wallet ready."
      onOpenChange={closeSignIn}
      open={isSignInOpen}
      title="Start your tab."
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-4"
        initial={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
      >
        {status === "signedIn" && account ? (
          <div className="rounded-md border border-primary-fixed bg-primary-soft p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FiCheckCircle aria-hidden="true" className="text-primary-strong" />
                <p className="font-semibold">Your Taby account is ready.</p>
              </div>
              <StatusChip tone="success">Wallet ready</StatusChip>
            </div>
          </div>
        ) : null}

        {isBusy ? (
          <LoadingState label="Getting your Taby account ready" rows={2} />
        ) : null}

        {status === "error" && errorCode ? (
          <ErrorCallout
            action={
              <Button
                icon={<FiRefreshCw aria-hidden="true" />}
                onClick={retryAccountSetup}
                size="sm"
              >
                Try again
              </Button>
            }
            message={accountErrorMessage(errorCode)}
          />
        ) : null}

        {status !== "signedIn" ? (
          <Button
            className="w-full"
            disabled={!magicReady || isBusy}
            icon={<FiMail aria-hidden="true" />}
            loading={isBusy}
            onClick={() => void signIn()}
          >
            Continue with email
          </Button>
        ) : null}
      </motion.div>
    </Sheet>
  );
}
