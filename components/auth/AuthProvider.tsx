"use client";

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Magic, type MagicUserMetadata } from "magic-sdk";
import type { Account, AccountErrorCode, AccountResponse } from "@/lib/account/types";

type AuthStatus = "initializing" | "signedOut" | "onboarding" | "signedIn" | "error";

type AuthContextValue = {
  account: Account | null;
  errorCode: AccountErrorCode | null;
  isSignInOpen: boolean;
  magicReady: boolean;
  status: AuthStatus;
  closeSignIn: () => void;
  openSignIn: () => void;
  retryAccountSetup: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<{ error?: string; ok: boolean }>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
const DEFAULT_CHAIN_ID = 421614;

function getWalletAddress(metadata: MagicUserMetadata) {
  return (
    metadata.wallets?.ethereum?.publicAddress ??
    ("publicAddress" in metadata && typeof metadata.publicAddress === "string"
      ? metadata.publicAddress
      : null)
  );
}

function mapAccount(account: AccountResponse): Account {
  return {
    ...account,
    walletStatus: "ready",
  };
}

function safeErrorCode(value: unknown): AccountErrorCode {
  if (
    value === "login_invalid" ||
    value === "wallet_unavailable" ||
    value === "account_unavailable" ||
    value === "configuration_missing"
  ) {
    return value;
  }

  return "account_unavailable";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [errorCode, setErrorCode] = useState<AccountErrorCode | null>(() =>
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY ? null : "configuration_missing",
  );
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [magic, setMagic] = useState<Magic | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY ? "initializing" : "error",
  );

  useEffect(() => {
    const publishableKey = process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;

    if (!publishableKey) {
      return;
    }

    let active = true;

    void Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      const rpcUrl = process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL ?? DEFAULT_RPC_URL;
      const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? DEFAULT_CHAIN_ID);
      setMagic(
        new Magic(publishableKey, {
          network: {
            chainId: Number.isFinite(chainId) ? chainId : DEFAULT_CHAIN_ID,
            rpcUrl,
          },
        }),
      );
    });

    return () => {
      active = false;
    };
  }, []);

  const magicReady = Boolean(magic);

  const setupAccount = useCallback(
    async (magicClient: Magic) => {
      setStatus("onboarding");
      setErrorCode(null);

      let metadata: MagicUserMetadata;

      try {
        metadata = await magicClient.user.getInfo();
      } catch {
        setStatus("error");
        setErrorCode("login_invalid");
        return false;
      }

      const walletAddress = getWalletAddress(metadata);

      if (!walletAddress) {
        setStatus("error");
        setErrorCode("wallet_unavailable");
        return false;
      }

      let didToken: string;

      try {
        didToken = await magicClient.user.generateIdToken({ lifespan: 900 });
      } catch {
        setStatus("error");
        setErrorCode("login_invalid");
        return false;
      }

      try {
        const response = await fetch("/api/account/upsert", {
          body: JSON.stringify({
            didToken,
            displayNameSeed: metadata.email,
            email: metadata.email,
            walletAddress,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json()) as {
          account?: AccountResponse;
          code?: AccountErrorCode;
        };

        if (!response.ok || !payload.account) {
          setStatus("error");
          setErrorCode(safeErrorCode(payload.code));
          return false;
        }

        setAccount(mapAccount(payload.account));
        setStatus("signedIn");
        setErrorCode(null);
        setIsSignInOpen(false);
        return true;
      } catch {
        setStatus("error");
        setErrorCode("account_unavailable");
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    if (!magic) {
      return;
    }

    const magicClient = magic;
    let active = true;

    async function checkSession() {
      try {
        const isLoggedIn = await magicClient.user.isLoggedIn();

        if (!active) {
          return;
        }

        if (!isLoggedIn) {
          setAccount(null);
          setStatus("signedOut");
          setErrorCode(null);
          return;
        }

        await setupAccount(magicClient);
      } catch {
        if (active) {
          setAccount(null);
          setStatus("error");
          setErrorCode("login_invalid");
        }
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [magic, setupAccount]);

  const signIn = useCallback(async () => {
    if (!magic) {
      setStatus("error");
      setErrorCode("configuration_missing");
      return;
    }

    setStatus("onboarding");
    setErrorCode(null);

    try {
      await magic.wallet.connectWithUI();
      const accountReady = await setupAccount(magic);

      if (accountReady) {
        router.push("/dashboard");
      }
    } catch {
      setStatus("error");
      setErrorCode("login_invalid");
    }
  }, [magic, router, setupAccount]);

  const retryAccountSetup = useCallback(async () => {
    if (!magic) {
      setStatus("error");
      setErrorCode("configuration_missing");
      return;
    }

    const isLoggedIn = await magic.user.isLoggedIn();

    if (!isLoggedIn) {
      await signIn();
      return;
    }

    const accountReady = await setupAccount(magic);

    if (accountReady) {
      router.push("/dashboard");
    }
  }, [magic, router, setupAccount, signIn]);

  const signOut = useCallback(async () => {
    if (magic) {
      try {
        await magic.user.logout();
      } catch {
        // Keep local state clearing reliable even if Magic reports a transient failure.
      }
    }

    setAccount(null);
    setStatus("signedOut");
    setErrorCode(null);
    setIsSignInOpen(false);
    router.replace("/");
  }, [magic, router]);

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!magic) {
        return { error: "Account setup is not configured yet.", ok: false };
      }

      const trimmed = displayName.trim();

      if (trimmed.length < 2) {
        return { error: "Use a name with at least 2 characters.", ok: false };
      }

      try {
        const didToken = await magic.user.generateIdToken({ lifespan: 900 });
        const response = await fetch("/api/account/profile", {
          body: JSON.stringify({ didToken, displayName: trimmed }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        const payload = (await response.json()) as {
          account?: AccountResponse;
        };

        if (!response.ok || !payload.account) {
          return { error: "We couldn’t save your name. Try again.", ok: false };
        }

        setAccount(mapAccount(payload.account));
        return { ok: true };
      } catch {
        return { error: "We couldn’t save your name. Try again.", ok: false };
      }
    },
    [magic],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      account,
      closeSignIn: () => setIsSignInOpen(false),
      errorCode,
      isSignInOpen,
      magicReady,
      openSignIn: () => setIsSignInOpen(true),
      retryAccountSetup,
      signIn,
      signOut,
      status,
      updateDisplayName,
    }),
    [
      account,
      errorCode,
      isSignInOpen,
      magicReady,
      retryAccountSetup,
      signIn,
      signOut,
      status,
      updateDisplayName,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
