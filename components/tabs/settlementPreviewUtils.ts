import { formatUsdc } from "@/lib/tabs/money";
import type {
  SettlementPreviewOutcome,
  SettlementPreviewThresholdResult,
} from "@/lib/tabs/types";

export function formatPreviewDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getOutcomeCopy(outcome: SettlementPreviewOutcome) {
  if (outcome.direction === "pays") {
    return {
      amount: formatUsdc(outcome.amountBaseUnits),
      label: "You pay",
      toneClassName: "text-debtor",
    };
  }

  if (outcome.direction === "receives") {
    return {
      amount: formatUsdc(outcome.amountBaseUnits),
      label: "You receive",
      toneClassName: "text-creditor",
    };
  }

  return {
    amount: "No payment from you",
    label: "Your outcome",
    toneClassName: "text-foreground",
  };
}

export function getThresholdCopy(result: SettlementPreviewThresholdResult | null) {
  if (!result?.requiresExplicitConfirmation) {
    return null;
  }

  if (result.reason === "amount_over_threshold") {
    return `This settlement is above ${formatUsdc(result.lowRiskMaxBaseUnits)}.`;
  }

  return `One payment uses more than ${result.capUsageThresholdPercent}% of its approved maximum.`;
}
