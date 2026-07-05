"use client";

import { FiCheckCircle, FiClock, FiUsers, FiX } from "react-icons/fi";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import type { TabSummaryResponse } from "@/lib/tabs/types";

type InviteCardProps = {
  index: number;
  loading: boolean;
  summary: TabSummaryResponse;
  onAccept: (tabId: string) => void;
  onDismiss: (tabId: string) => void;
};

export function InviteCard({
  index,
  loading,
  summary,
  onAccept,
  onDismiss,
}: InviteCardProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: Math.min(index * 0.04, 0.16), duration: 0.22 }}
    >
      <Card className="h-full">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusChip tone="pending">Invited</StatusChip>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
                  <FiClock aria-hidden="true" />
                  Waiting for you
                </span>
              </div>
              <h3 className="break-words text-xl font-semibold leading-7 text-foreground">
                {summary.tab.title}
              </h3>
              {summary.ownerDisplayName ? (
                <p className="mt-1 text-sm leading-6 text-muted">
                  Invited by {summary.ownerDisplayName}
                </p>
              ) : null}
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-muted">
              <FiUsers aria-hidden="true" />
              {summary.memberCount}
            </span>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              icon={<FiX aria-hidden="true" />}
              onClick={() => onDismiss(summary.tab.id)}
              size="sm"
              variant="ghost"
            >
              Not now
            </Button>
            <Button
              icon={<FiCheckCircle aria-hidden="true" />}
              loading={loading}
              onClick={() => onAccept(summary.tab.id)}
              size="sm"
            >
              {loading ? "Joining tab" : "Accept invite"}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
