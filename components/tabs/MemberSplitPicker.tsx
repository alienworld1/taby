"use client";

import { FiCheckCircle } from "react-icons/fi";
import { motion } from "motion/react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { formatUsdc } from "@/lib/tabs/money";
import type { TabMemberResponse } from "@/lib/tabs/types";

type MemberSplitPickerProps = {
  amountBaseUnits: bigint | null;
  customShares: Record<string, string>;
  equalShares: Map<string, bigint>;
  fieldErrors: Record<string, string>;
  members: TabMemberResponse[];
  selectedMemberIds: string[];
  splitMethod: "equal" | "custom";
  onCustomShareChange: (memberId: string, value: string) => void;
  onToggleMember: (memberId: string) => void;
};

export function MemberSplitPicker({
  amountBaseUnits,
  customShares,
  equalShares,
  fieldErrors,
  members,
  selectedMemberIds,
  splitMethod,
  onCustomShareChange,
  onToggleMember,
}: MemberSplitPickerProps) {
  const selectedIds = new Set(selectedMemberIds);

  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold text-foreground">Split between</span>
      {fieldErrors.selectedMemberIds ? (
        <p className="text-sm text-error">{fieldErrors.selectedMemberIds}</p>
      ) : null}
      <div className="grid gap-2">
        {members.map((member) => {
          const selected = selectedIds.has(member.id);
          const equalShare = equalShares.get(member.id);

          return (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "rounded-md border p-3 transition",
                selected
                  ? "border-primary-fixed bg-primary-soft/55"
                  : "border-outline-variant bg-surface-container-lowest",
              )}
              initial={{ opacity: 0, y: 4 }}
              key={member.id}
              layout
            >
              <label className="flex min-h-11 items-center gap-3">
                <input
                  checked={selected}
                  className="size-4 accent-primary"
                  onChange={() => onToggleMember(member.id)}
                  type="checkbox"
                />
                <span className="min-w-0 flex-1 font-semibold text-foreground">
                  {member.displayName}
                </span>
                {selected ? (
                  <FiCheckCircle aria-hidden="true" className="shrink-0 text-primary" />
                ) : null}
              </label>
              {selected && splitMethod === "equal" ? (
                <p className="mt-2 text-sm tabular-nums text-muted">
                  {amountBaseUnits && equalShare !== undefined
                    ? formatUsdc(equalShare)
                    : "Enter an amount to preview this share."}
                </p>
              ) : null}
              {selected && splitMethod === "custom" ? (
                <div className="mt-3">
                  <Input
                    error={fieldErrors[`share:${member.id}`]}
                    inputMode="decimal"
                    label={`${member.displayName}'s share`}
                    min="0"
                    onChange={(event) => onCustomShareChange(member.id, event.target.value)}
                    placeholder="0.00"
                    value={customShares[member.id] ?? ""}
                  />
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
