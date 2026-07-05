"use client";

import Link from "next/link";
import { FiArrowLeft, FiLock, FiUsers } from "react-icons/fi";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatTabStatus, tabStatusTone } from "@/components/tabs/tabDisplay";
import type { TabResponse } from "@/lib/tabs/types";

type TabHeaderProps = {
  memberCount: number;
  tab: TabResponse;
};

export function TabHeader({ memberCount, tab }: TabHeaderProps) {
  return (
    <Card className="grid gap-5">
      <Link
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted transition hover:text-foreground"
        href="/dashboard"
      >
        <FiArrowLeft aria-hidden="true" />
        Back to tabs
      </Link>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusChip tone={tabStatusTone(tab.status)}>{formatTabStatus(tab.status)}</StatusChip>
            <span className="inline-flex min-h-7 items-center gap-2 rounded-full bg-surface-container px-3 text-sm font-semibold text-muted">
              <FiUsers aria-hidden="true" />
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
          </div>
          <h2 className="break-words text-2xl font-semibold leading-8 text-foreground sm:text-3xl sm:leading-10">
            {tab.title}
          </h2>
          {tab.description ? (
            <p className="mt-2 max-w-2xl break-words text-base leading-7 text-muted">
              {tab.description}
            </p>
          ) : null}
        </div>
        <div className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-muted">
          <span className="inline-flex items-center gap-2 font-semibold text-foreground">
            <FiLock aria-hidden="true" />
            USDC settlement
          </span>
          <p className="mt-1">Details stay ready for when this tab settles.</p>
        </div>
      </div>
    </Card>
  );
}
