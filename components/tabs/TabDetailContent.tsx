"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiFileText } from "react-icons/fi";
import { motion } from "motion/react";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { useAuth } from "@/components/auth/useAuth";
import { AddMemberSheet } from "@/components/tabs/AddMemberSheet";
import { ExpensePlaceholder } from "@/components/tabs/ExpensePlaceholder";
import { MemberPanel } from "@/components/tabs/MemberPanel";
import { SetupProgressStrip } from "@/components/tabs/SetupProgressStrip";
import { TabHeader } from "@/components/tabs/TabHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { LoadingState } from "@/components/ui/LoadingState";
import { accountErrorMessage } from "@/lib/account/messages";
import {
  addMemberRequest,
  fetchTabDetail,
  toTabClientError,
  type TabClientError,
} from "@/lib/tabs/client";
import type { TabDetailResponse } from "@/lib/tabs/types";

type TabDetailContentProps = {
  tabId: string;
};

function isAccessError(error: TabClientError | null) {
  return error?.code === "not_found" || error?.code === "validation_failed";
}

export function TabDetailContent({ tabId }: TabDetailContentProps) {
  const { account, errorCode, getDidToken, retryAccountSetup, status } = useAuth();
  const [addError, setAddError] = useState<TabClientError | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [detail, setDetail] = useState<TabDetailResponse | null>(null);
  const [fetchError, setFetchError] = useState<TabClientError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (status !== "signedIn") {
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    const didToken = await getDidToken();

    if (!didToken) {
      setFetchError({
        code: "unauthenticated",
        message: "Sign in to continue.",
      });
      setIsLoading(false);
      return;
    }

    try {
      setDetail(await fetchTabDetail(didToken, tabId));
    } catch (error) {
      setFetchError(toTabClientError(error));
    } finally {
      setIsLoading(false);
    }
  }, [getDidToken, status, tabId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDetail();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadDetail]);

  const isOwner = useMemo(() => {
    if (!account || !detail) {
      return false;
    }

    return (
      detail.tab.ownerUserId === account.id ||
      detail.members.some(
        (member) =>
          member.userId === account.id &&
          member.role === "owner" &&
          member.joinStatus === "joined",
      )
    );
  }, [account, detail]);

  async function handleAddMember(displayName: string) {
    if (!detail) {
      return false;
    }

    setAddSubmitting(true);
    setAddError(null);

    const didToken = await getDidToken();

    if (!didToken) {
      setAddError({
        code: "unauthenticated",
        message: "Sign in to continue.",
      });
      setAddSubmitting(false);
      return false;
    }

    try {
      const created = await addMemberRequest(didToken, detail.tab.id, { displayName });
      setDetail((currentDetail) =>
        currentDetail
          ? {
              ...currentDetail,
              members: [...currentDetail.members, created.member],
            }
          : currentDetail,
      );
      setAddOpen(false);
      return true;
    } catch (error) {
      const clientError = toTabClientError(error);
      setAddError(
        clientError.code === "unauthorized" && !isOwner
          ? {
              ...clientError,
              message: "Only the owner can add members.",
            }
          : clientError,
      );
      return false;
    } finally {
      setAddSubmitting(false);
    }
  }

  if (status === "initializing" || status === "onboarding") {
    return <LoadingState label="Opening this tab" rows={3} />;
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
        description="Sign in to open this tab and see the people your group has added."
        title="Sign in to open your tabs."
      />
    );
  }

  if (isLoading && !detail) {
    return <LoadingState label="Opening this tab" rows={3} />;
  }

  if (isAccessError(fetchError)) {
    return (
      <EmptyState
        description="The tab may have moved, or you may need a different account."
        icon={<FiFileText aria-hidden="true" />}
        title="We could not find that tab."
      />
    );
  }

  if (fetchError && !detail) {
    return (
      <ErrorCallout
        action={<Button onClick={loadDetail}>Try again</Button>}
        message={fetchError.message}
        title="We could not open this tab"
      />
    );
  }

  if (!detail) {
    return <LoadingState label="Opening this tab" rows={3} />;
  }

  const visibleMembers = detail.members.filter((member) => member.joinStatus !== "removed");

  return (
    <>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-5"
        initial={{ opacity: 0, y: 8 }}
      >
        {fetchError ? (
          <ErrorCallout
            action={<Button onClick={loadDetail}>Try again</Button>}
            message={fetchError.message}
            title="This tab may be out of date"
          />
        ) : null}
        <TabHeader memberCount={visibleMembers.length} tab={detail.tab} />
        <SetupProgressStrip />
        <MemberPanel
          isOwner={isOwner}
          members={detail.members}
          tab={detail.tab}
          onAddMember={() => {
            setAddError(null);
            setAddOpen(true);
          }}
        />
        <ExpensePlaceholder memberCount={visibleMembers.length} tab={detail.tab} />
      </motion.div>

      <AddMemberSheet
        error={addError}
        loading={addSubmitting}
        members={detail.members}
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (open) {
            setAddError(null);
          }
        }}
        onSubmit={handleAddMember}
      />
    </>
  );
}
