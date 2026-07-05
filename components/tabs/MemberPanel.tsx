"use client";

import { FiLock, FiUserPlus } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MemberRow } from "@/components/tabs/MemberRow";
import type { TabMemberResponse, TabResponse } from "@/lib/tabs/types";

type MemberPanelProps = {
  isOwner: boolean;
  members: TabMemberResponse[];
  tab: TabResponse;
  onInviteMember: () => void;
};

function disabledReason(tab: TabResponse, isOwner: boolean) {
  if (!isOwner) {
    return "Only the owner can invite members.";
  }

  if (tab.status === "settled" || tab.status === "cancelled") {
    return "This tab is read-only now.";
  }

  return null;
}

export function MemberPanel({ isOwner, members, tab, onInviteMember }: MemberPanelProps) {
  const visibleMembers = members.filter((member) => member.joinStatus !== "removed");
  const reason = disabledReason(tab, isOwner);

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Members</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Invite people who already have a Taby account.
          </p>
        </div>
        {reason ? (
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-surface-container px-3 py-2 text-sm font-semibold text-muted">
            <FiLock aria-hidden="true" />
            {reason}
          </span>
        ) : (
          <Button icon={<FiUserPlus aria-hidden="true" />} onClick={onInviteMember}>
            Invite member
          </Button>
        )}
      </div>
      <ul className="mt-3">
        {visibleMembers.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </ul>
    </Card>
  );
}
