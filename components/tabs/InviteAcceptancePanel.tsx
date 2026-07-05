"use client";

import { FiCheckCircle, FiClock, FiUsers } from "react-icons/fi";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { StatusChip } from "@/components/ui/StatusChip";
import type { TabClientError } from "@/lib/tabs/client";
import type { TabResponse } from "@/lib/tabs/types";

type InviteAcceptancePanelProps = {
  error: TabClientError | null;
  loading: boolean;
  memberCount: number;
  ownerDisplayName: string | null;
  tab: TabResponse;
  onAccept: () => void;
};

export function InviteAcceptancePanel({
  error,
  loading,
  memberCount,
  ownerDisplayName,
  tab,
  onAccept,
}: InviteAcceptancePanelProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto grid w-full max-w-2xl gap-4"
      initial={{ opacity: 0, y: 8 }}
    >
      {error ? (
        <ErrorCallout message={error.message} title="We could not join this tab" />
      ) : null}
      <Card>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="pending">Invited</StatusChip>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
              <FiClock aria-hidden="true" />
              Waiting for you
            </span>
          </div>
          <div>
            <h1 className="break-words text-3xl font-semibold leading-10 text-foreground">
              {tab.title}
            </h1>
            {tab.description ? (
              <p className="mt-2 text-base leading-7 text-muted">{tab.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-muted">
            {ownerDisplayName ? <span>Invited by {ownerDisplayName}</span> : null}
            <span className="inline-flex items-center gap-2">
              <FiUsers aria-hidden="true" />
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
          </div>
          <div className="flex flex-col gap-2 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted">
              Accept to join this tab and help your group review expenses.
            </p>
            <Button
              className="shrink-0"
              icon={<FiCheckCircle aria-hidden="true" />}
              loading={loading}
              onClick={onAccept}
            >
              {loading ? "Joining tab" : "Accept invite"}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
