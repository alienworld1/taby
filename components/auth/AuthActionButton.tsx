"use client";

import { FiPlusCircle } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/useAuth";
import { Button } from "@/components/ui/Button";

type AuthActionButtonProps = {
  children?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
};

export function AuthActionButton({
  children = "Create a tab",
  className,
  size = "md",
  variant = "primary",
}: AuthActionButtonProps) {
  const { openSignIn, status } = useAuth();
  const router = useRouter();

  return (
    <Button
      className={className}
      disabled={status === "initializing" || status === "onboarding"}
      icon={<FiPlusCircle aria-hidden="true" />}
      loading={status === "onboarding"}
      onClick={() => {
        if (status === "signedIn") {
          router.push("/dashboard?create=1");
          return;
        }

        openSignIn();
      }}
      size={size}
      variant={variant}
    >
      {children}
    </Button>
  );
}
