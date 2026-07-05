"use client";

import { InviteCard } from "@/components/tabs/InviteCard";
import type { TabSummaryResponse } from "@/lib/tabs/types";

type InviteGroupProps = {
  acceptingTabId: string | null;
  invites: TabSummaryResponse[];
  onAccept: (tabId: string) => void;
  onDismiss: (tabId: string) => void;
};

export function InviteGroup({
  acceptingTabId,
  invites,
  onAccept,
  onDismiss,
}: InviteGroupProps) {
  if (invites.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-3" aria-labelledby="invites-heading">
      <h2 className="text-lg font-semibold text-foreground" id="invites-heading">
        Invites
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {invites.map((summary, index) => (
          <InviteCard
            index={index}
            key={summary.tab.id}
            loading={acceptingTabId === summary.tab.id}
            summary={summary}
            onAccept={onAccept}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </section>
  );
}
