"use client";

import Link from "next/link";
import { FiArrowRight, FiUsers } from "react-icons/fi";
import { motion } from "motion/react";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { tabStatusTone } from "@/components/tabs/tabDisplay";
import type { TabSummaryResponse } from "@/lib/tabs/types";

type TabCardProps = {
  index: number;
  summary: TabSummaryResponse;
};

function nextStepLabel(summary: TabSummaryResponse) {
  if (summary.nextAction) return summary.nextAction;
  if (summary.tab.status === "settled") {
    return "Review the settled tab";
  }

  if (summary.tab.status === "cancelled") {
    return "View tab details";
  }

  if (summary.memberCount < 2) {
    return "Invite members";
  }

  return "Open tab";
}

export function TabCard({ index, summary }: TabCardProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: Math.min(index * 0.04, 0.16), duration: 0.22 }}
    >
      <Link
        aria-label={`Open ${summary.tab.title}`}
        className="group block focus:outline-none"
        href={`/tabs/${summary.tab.id}`}
      >
        <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-outline group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-primary">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold leading-7 text-foreground">
                {summary.tab.title}
              </h2>
              {summary.tab.description ? (
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">
                  {summary.tab.description}
                </p>
              ) : null}
            </div>
            <StatusChip tone={summary.presentationState === "settled" ? "success" : tabStatusTone(summary.tab.status)}>
              {summary.presentationState
                ? summary.presentationState.replaceAll("_", " ")
                : "Needs review"}
            </StatusChip>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
              <FiUsers aria-hidden="true" />
              {summary.memberCount} {summary.memberCount === 1 ? "member" : "members"}
            </span>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-strong">
              {nextStepLabel(summary)}
              <FiArrowRight aria-hidden="true" className="transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
