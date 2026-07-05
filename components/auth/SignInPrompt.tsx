"use client";

import { FiLogIn } from "react-icons/fi";
import { useAuth } from "@/components/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type SignInPromptProps = {
  description: string;
  title: string;
};

export function SignInPrompt({ description, title }: SignInPromptProps) {
  const { openSignIn, status } = useAuth();

  return (
    <EmptyState
      action={
        <Button
          disabled={status === "initializing" || status === "onboarding"}
          icon={<FiLogIn aria-hidden="true" />}
          loading={status === "onboarding"}
          onClick={openSignIn}
        >
          Sign in
        </Button>
      }
      description={description}
      icon={<FiLogIn aria-hidden="true" />}
      title={title}
    />
  );
}
