"use client";

import { FiCheckCircle, FiClock, FiUser } from "react-icons/fi";
import { motion } from "motion/react";
import { StatusChip } from "@/components/ui/StatusChip";
import { memberReadinessCopy, memberStatusLabels } from "@/components/tabs/tabDisplay";
import type { TabMemberResponse } from "@/lib/tabs/types";

type MemberRowProps = {
  member: TabMemberResponse;
};

export function MemberRow({ member }: MemberRowProps) {
  const isReady = member.readinessStatus === "ready" || member.readinessStatus === "settled";

  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-3 border-b border-outline-variant py-4 last:border-b-0"
      initial={{ opacity: 0, y: 6 }}
      layout
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong">
            <FiUser aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="break-words text-base font-semibold text-foreground">
              {member.displayName}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted">{memberReadinessCopy(member)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {memberStatusLabels(member).map((label) => (
            <StatusChip
              key={label}
              tone={
                label === "Owner" || label === "Joined" || label === "Ready"
                  ? "success"
                  : label === "Needs wallet" || label === "Not ready"
                    ? "neutral"
                    : "pending"
              }
            >
              {label}
            </StatusChip>
          ))}
        </div>
      </div>
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
        {isReady ? <FiCheckCircle aria-hidden="true" /> : <FiClock aria-hidden="true" />}
        {isReady ? "Ready" : "Not ready"}
      </span>
    </motion.li>
  );
}
