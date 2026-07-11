"use client";

import { FiAlertCircle, FiCheckCircle, FiClock, FiXCircle } from "react-icons/fi";
import { motion } from "motion/react";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";
import { formatExpiry } from "@/components/tabs/proposalUtils";
import type { AuthorizationReadinessItem } from "@/components/tabs/authorizationUtils";

type AuthorizationStatusRowProps = {
  item: AuthorizationReadinessItem;
  reducedMotion: boolean;
};

export function AuthorizationStatusRow({ item, reducedMotion }: AuthorizationStatusRowProps) {
  const tone = getTone(item.status);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
      transition={{ duration: reducedMotion ? 0 : 0.16 }}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {item.displayName}
          </span>
          <StatusChip tone={tone}>
            <span className="inline-flex items-center gap-1.5">
              {item.status === "authorized" ? (
                <FiCheckCircle aria-hidden="true" />
              ) : item.status === "expired" ? (
                <FiClock aria-hidden="true" />
              ) : item.status === "revoked" ? (
                <FiXCircle aria-hidden="true" />
              ) : (
                <FiAlertCircle aria-hidden="true" />
              )}
              {item.message}
            </span>
          </StatusChip>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted">
          Owes {formatUsdc(item.owedBaseUnits)}
          {item.status === "authorized" && item.capBaseUnits
            ? ` - Approved ${formatUsdc(item.capBaseUnits)}`
            : ""}
        </p>
      </div>
      {item.expiresAt ? (
        <p className="text-left text-xs font-semibold leading-5 text-muted sm:text-right">
          Expires {formatExpiry(item.expiresAt)}
        </p>
      ) : null}
    </motion.div>
  );
}

function getTone(status: AuthorizationReadinessItem["status"]) {
  switch (status) {
    case "authorized":
      return "success" as const;
    case "expired":
    case "revoked":
    case "insufficient_allowance":
      return "warning" as const;
    case "error":
    case "wallet_unavailable":
    case "configuration_missing":
      return "error" as const;
    default:
      return "pending" as const;
  }
}
