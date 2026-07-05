"use client";

import { FiRefreshCw, FiSettings } from "react-icons/fi";
import { useAuth } from "@/components/auth/useAuth";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { AccountProfileCard } from "@/components/account/AccountProfileCard";
import { WalletDetailsCard } from "@/components/account/WalletDetailsCard";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { LoadingState } from "@/components/ui/LoadingState";
import { accountErrorMessage } from "@/lib/account/messages";

export function SettingsContent() {
  const { account, errorCode, retryAccountSetup, status } = useAuth();

  if (status === "initializing" || status === "onboarding") {
    return <LoadingState label="Getting your Taby account ready" rows={3} />;
  }

  if (status === "error" && errorCode) {
    return (
      <ErrorCallout
        action={
          <Button icon={<FiRefreshCw aria-hidden="true" />} onClick={retryAccountSetup}>
            Try again
          </Button>
        }
        message={accountErrorMessage(errorCode)}
      />
    );
  }

  if (!account) {
    return (
      <SignInPrompt
        description="Sign in to manage your profile and account details."
        title="Sign in to open settings."
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <AccountProfileCard account={account} key={`${account.id}-${account.displayName}`} />
      <WalletDetailsCard account={account} icon={<FiSettings aria-hidden="true" />} />
    </div>
  );
}
