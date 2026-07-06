"use client";

import { FiCheckCircle } from "react-icons/fi";
import { AuthorizationStatusRow } from "@/components/tabs/AuthorizationStatusRow";
import type { AuthorizationReadinessItem } from "@/components/tabs/authorizationUtils";

type AuthorizationReadinessListProps = {
  items: AuthorizationReadinessItem[];
  reducedMotion: boolean;
};

export function AuthorizationReadinessList({
  items,
  reducedMotion,
}: AuthorizationReadinessListProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-primary-fixed bg-primary-soft px-4 py-3 text-primary-strong">
        <FiCheckCircle aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="text-sm font-semibold leading-6">
          No one owes anything in this proposal.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <AuthorizationStatusRow key={item.memberId} item={item} reducedMotion={reducedMotion} />
      ))}
    </div>
  );
}
