"use client";

import { FiLogOut, FiUser } from "react-icons/fi";
import { useAuth } from "@/components/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";

export function AuthStatusControl() {
  const { account, openSignIn, signOut, status } = useAuth();

  if (status === "signedIn" && account) {
    return (
      <div className="flex items-center gap-2">
        <StatusChip tone="success">Signed in</StatusChip>
        <Button
          aria-label="Sign out"
          className="size-10 rounded-full px-0"
          icon={<FiLogOut aria-hidden="true" />}
          onClick={signOut}
          variant="ghost"
        >
          <span className="sr-only">Sign out</span>
        </Button>
      </div>
    );
  }

  return (
    <Button
      icon={<FiUser aria-hidden="true" />}
      onClick={openSignIn}
      size="sm"
      variant="secondary"
    >
      Sign in
    </Button>
  );
}
