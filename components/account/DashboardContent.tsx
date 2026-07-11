"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiPlusCircle } from "react-icons/fi";
import { motion } from "motion/react";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { useAuth } from "@/components/auth/useAuth";
import { CreateTabSheet } from "@/components/tabs/CreateTabSheet";
import { InviteGroup } from "@/components/tabs/InviteGroup";
import { TabGroup } from "@/components/tabs/TabGroup";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { LoadingState } from "@/components/ui/LoadingState";
import { accountErrorMessage } from "@/lib/account/messages";
import {
  createTabRequest,
  acceptInviteRequest,
  fetchTabs,
  toTabClientError,
  type TabClientError,
} from "@/lib/tabs/client";
import type { TabSummaryResponse } from "@/lib/tabs/types";

export function DashboardContent() {
  const { account, errorCode, getDidToken, retryAccountSetup, status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createError, setCreateError] = useState<TabClientError | null>(null);
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("create") === "1");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [acceptError, setAcceptError] = useState<TabClientError | null>(null);
  const [acceptingTabId, setAcceptingTabId] = useState<string | null>(null);
  const [dismissedInviteIds, setDismissedInviteIds] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<TabClientError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tabs, setTabs] = useState<TabSummaryResponse[]>([]);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      router.replace("/dashboard", { scroll: false });
    }
  }, [router, searchParams]);

  const loadTabs = useCallback(async () => {
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
      setTabs(await fetchTabs(didToken));
    } catch (error) {
      setFetchError(toTabClientError(error));
    } finally {
      setIsLoading(false);
    }
  }, [getDidToken, status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTabs();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadTabs]);

  const groupedTabs = useMemo(() => {
    const visibleInvites = tabs.filter(
      (summary) =>
        summary.currentMember?.joinStatus === "invited" &&
        !dismissedInviteIds.includes(summary.tab.id),
    );
    const joinedTabs = tabs.filter((summary) => {
      if (summary.currentMember) {
        return summary.currentMember.joinStatus === "joined";
      }

      return account ? summary.tab.ownerUserId === account.id : false;
    });
    const setup = joinedTabs.filter((summary) => summary.memberCount < 2 && summary.presentationState !== "settled");
    const stage = (value: NonNullable<TabSummaryResponse["presentationState"]>) =>
      joinedTabs.filter((summary) => summary.memberCount >= 2 && summary.presentationState === value);

    return {
      awaitingApproval: stage("awaiting_approval"),
      invites: visibleInvites,
      needsReview: stage("needs_review"),
      readyToSettle: stage("ready_to_settle"),
      settled: stage("settled"),
      setup,
    };
  }, [account, dismissedInviteIds, tabs]);

  async function handleCreate(input: { description?: string; title: string }) {
    setCreateSubmitting(true);
    setCreateError(null);

    const didToken = await getDidToken();

    if (!didToken) {
      setCreateError({
        code: "unauthenticated",
        message: "Sign in to continue.",
      });
      setCreateSubmitting(false);
      return false;
    }

    try {
      const created = await createTabRequest(didToken, input);
      setTabs((currentTabs) => [
        {
          currentMember: created.ownerMember,
          memberCount: 1,
          nextAction: "Invite members",
          ownerDisplayName: created.ownerMember.displayName,
          presentationState: "needs_review",
          tab: created.tab,
        },
        ...currentTabs.filter((summary) => summary.tab.id !== created.tab.id),
      ]);
      setCreateOpen(false);
      router.push(`/tabs/${created.tab.id}`);
      return true;
    } catch (error) {
      setCreateError(toTabClientError(error));
      return false;
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleAcceptInvite(tabId: string) {
    setAcceptingTabId(tabId);
    setAcceptError(null);

    const didToken = await getDidToken();

    if (!didToken) {
      setAcceptError({
        code: "unauthenticated",
        message: "Sign in to continue.",
      });
      setAcceptingTabId(null);
      return;
    }

    try {
      const accepted = await acceptInviteRequest(didToken, tabId);
      setTabs((currentTabs) =>
        currentTabs.map((summary) =>
          summary.tab.id === tabId
            ? { ...summary, currentMember: accepted.member }
            : summary,
        ),
      );
      router.push(`/tabs/${tabId}`);
    } catch (error) {
      setAcceptError(toTabClientError(error));
    } finally {
      setAcceptingTabId(null);
    }
  }

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

  if (isLoading && tabs.length === 0) {
    return <LoadingState label="Loading your tabs" rows={3} />;
  }

  return (
    <>
      <div className="grid gap-5">
        {fetchError ? (
          <ErrorCallout
            action={<Button onClick={loadTabs}>Try again</Button>}
            message={fetchError.message}
            title="We could not load your tabs"
          />
        ) : null}
        {acceptError ? (
          <ErrorCallout message={acceptError.message} title="We could not accept that invite" />
        ) : null}

        {tabs.length === 0 && !fetchError ? (
          <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 8 }}>
            <EmptyState
              action={
                <Button
                  icon={<FiPlusCircle aria-hidden="true" />}
                  onClick={() => setCreateOpen(true)}
                >
                  Create your first tab
                </Button>
              }
          description="Create a shared tab when your group is ready to agree on what counts."
              icon={<FiPlusCircle aria-hidden="true" />}
              title="No tabs yet."
            />
          </motion.div>
        ) : (
          <div className="grid gap-6">
            <div className="flex flex-col gap-3 rounded-md border border-outline-variant bg-surface-container-lowest p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted">
                Keep each group moving from agreed expenses to one Final Tab.
              </p>
              <Button
                className="shrink-0"
                icon={<FiPlusCircle aria-hidden="true" />}
                onClick={() => setCreateOpen(true)}
              >
                Create tab
              </Button>
            </div>
            <TabGroup
              emptyCopy="Tabs that need one more person will appear here."
              tabs={groupedTabs.setup}
              title="Needs setup"
            />
            <InviteGroup
              acceptingTabId={acceptingTabId}
              invites={groupedTabs.invites}
              onAccept={handleAcceptInvite}
              onDismiss={(tabId) =>
                setDismissedInviteIds((currentIds) => [...new Set([...currentIds, tabId])])
              }
            />
            <TabGroup tabs={groupedTabs.needsReview} title="Needs review" />
            <TabGroup tabs={groupedTabs.awaitingApproval} title="Awaiting approval" />
            <TabGroup tabs={groupedTabs.readyToSettle} title="Ready to settle" />
            <TabGroup tabs={groupedTabs.settled} title="Settled" />
          </div>
        )}
      </div>

      <CreateTabSheet
        error={createError}
        loading={createSubmitting}
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          setCreateError(null);
        }}
        onSubmit={handleCreate}
      />
    </>
  );
}
