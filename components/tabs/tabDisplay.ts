import type { TabMemberResponse, TabStatus } from "@/lib/tabs/types";

export function formatTabStatus(status: TabStatus) {
  switch (status) {
    case "active":
      return "Active";
    case "review":
      return "Review";
    case "locked":
      return "Locked";
    case "settling":
      return "Settling";
    case "settled":
      return "Settled";
    case "cancelled":
      return "Cancelled";
    case "draft":
      return "Draft";
    default:
      return "Active";
  }
}

export function tabStatusTone(status: TabStatus) {
  if (status === "settled") {
    return "success" as const;
  }

  if (status === "cancelled") {
    return "neutral" as const;
  }

  if (status === "locked" || status === "settling") {
    return "warning" as const;
  }

  return "pending" as const;
}

export function memberStatusLabels(member: TabMemberResponse) {
  const labels = [member.role === "owner" ? "Owner" : "Member"];

  if (member.joinStatus === "joined") {
    labels.push("Joined");
  } else if (member.joinStatus === "invited") {
    labels.push("Invited");
  }

  if (!member.walletAddress) {
    labels.push("Needs wallet");
  }

  if (member.readinessStatus === "ready") {
    labels.push("Ready");
  } else if (member.readinessStatus === "settled") {
    labels.push("Settled");
  } else {
    labels.push("Not ready");
  }

  return labels;
}

export function memberReadinessCopy(member: TabMemberResponse) {
  if (member.joinStatus === "removed") {
    return "No longer part of this tab.";
  }

  if (member.role === "owner" && member.joinStatus === "joined") {
    return "Ready to start adding expenses.";
  }

  if (member.joinStatus === "invited") {
    return member.walletAddress
      ? "Can review expenses after joining."
      : "Can review expenses after joining. Wallet needed before settlement.";
  }

  if (!member.walletAddress) {
    return "Wallet needed before settlement.";
  }

  return "Ready to review expenses.";
}
