import type {
  ActivityEventResponse,
  AgreementTimelineEventResponse,
  SettlementAttemptResponse,
  SettlementProposalResponse,
  TabAuthorizationResponse,
  TabMemberResponse,
} from "@/lib/tabs/types";

type Input = {
  authorizations: TabAuthorizationResponse[];
  events: ActivityEventResponse[];
  latestAttempt: SettlementAttemptResponse | null;
  members: TabMemberResponse[];
  nowMs: number;
  proposal: SettlementProposalResponse | null;
  verifiedSettled: boolean;
};

type EventData = Record<string, unknown>;
const allowedTypes = new Set(["tab_created", "expense_added", "expense_confirmed", "expense_confirmed_all", "expense_disputed", "proposal_created", "proposal_locked", "authorization_recorded", "authorization_revoked", "settlement_submitted", "settlement_failed", "settlement_completed", "settlement_reconciled"]);

function data(value: unknown): EventData { return value && typeof value === "object" && !Array.isArray(value) ? value as EventData : {}; }
function string(value: unknown) { return typeof value === "string" && value.trim() ? value : null; }
function validDate(value: string) { return !Number.isNaN(new Date(value).getTime()); }

export function buildAgreementTimeline(input: Input): AgreementTimelineEventResponse[] {
  const members = new Map(input.members.map((member) => [member.id, member.displayName]));
  const terminalExpenseKeys = new Set(input.events.filter((event) => event.eventType === "expense_confirmed_all").map((event) => string(data(event.eventData).expenseId)).filter(Boolean));
  const mapped = input.events.flatMap((event) => {
    if (!allowedTypes.has(event.eventType) || !validDate(event.createdAt)) return [];
    const payload = data(event.eventData); const title = string(payload.title); const memberName = members.get(string(payload.memberId) ?? "") ?? "A group member";
    if (event.eventType === "expense_confirmed" && terminalExpenseKeys.has(string(payload.expenseId))) return [];
    const result: Record<string, { kind: AgreementTimelineEventResponse["kind"]; message: string }> = {
      tab_created: { kind: "tab_created", message: "Tab created" },
      expense_added: { kind: "expense_added", message: title ? `${title} added for group review.` : "An expense was added for group review." },
      expense_confirmed: { kind: "expense_confirmed", message: title ? `${title} was confirmed.` : "An expense was confirmed." },
      expense_confirmed_all: { kind: "expense_confirmed", message: title ? `${title} was confirmed by the group.` : "An expense was confirmed by the group." },
      expense_disputed: { kind: "expense_disputed", message: title ? `${title} is disputed and stays outside settlement.` : "An expense is disputed and stays outside settlement." },
      proposal_created: { kind: "final_tab_created", message: "Final Tab created" },
      proposal_locked: { kind: "final_tab_locked", message: "Final Tab registered and locked" },
      authorization_recorded: { kind: "member_authorized", message: `${memberName} approved this Final Tab.` },
      authorization_revoked: { kind: "authorization_revoked", message: `${memberName} revoked approval for this Final Tab.` },
      settlement_submitted: { kind: "settlement_submitted", message: "Settlement submitted" },
      settlement_failed: { kind: "settlement_failed", message: "Settlement did not go through. Nothing moved." },
      settlement_completed: { kind: "settlement_confirmed", message: "Final Tab settled" },
      settlement_reconciled: { kind: "settlement_confirmed", message: "Final Tab settled" },
    };
    const normalized = result[event.eventType];
    if (!normalized || ((event.eventType === "settlement_completed" || event.eventType === "settlement_reconciled") && !input.verifiedSettled)) return [];
    if (event.eventType === "settlement_failed" && !["failed", "reverted"].includes(input.latestAttempt?.status ?? "")) return [];
    return [{ id: event.id, ...normalized, occurredAt: event.createdAt }];
  });
  if (input.proposal) {
    const expired = input.authorizations.filter((authorization) => authorization.proposalHash === input.proposal?.proposalHash && !authorization.revokedAt && new Date(authorization.expiresAt).getTime() <= input.nowMs).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    for (const authorization of expired) {
      const newer = input.authorizations.some((candidate) => candidate.memberId === authorization.memberId && candidate.proposalHash === authorization.proposalHash && candidate.id !== authorization.id && !candidate.revokedAt && new Date(candidate.expiresAt).getTime() > input.nowMs && new Date(candidate.createdAt).getTime() > new Date(authorization.createdAt).getTime());
      if (!newer) mapped.push({ id: `expired:${authorization.id}`, kind: "authorization_expired", message: `${members.get(authorization.memberId) ?? "A group member"}'s approval expired.`, occurredAt: authorization.expiresAt });
    }
  }
  if (input.verifiedSettled && !mapped.some((event) => event.kind === "settlement_confirmed")) {
    mapped.push({ id: `settled:${input.latestAttempt?.id ?? input.proposal?.id ?? "final"}`, kind: "settlement_confirmed", message: "Final Tab settled", occurredAt: input.latestAttempt?.updatedAt ?? input.proposal?.executedAt ?? new Date(input.nowMs).toISOString() });
  }
  const terminal = new Set<string>();
  return mapped.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() || a.id.localeCompare(b.id)).filter((event) => {
    if (event.kind !== "settlement_confirmed" && event.kind !== "settlement_failed") return true;
    const key = event.kind; if (terminal.has(key)) return false; terminal.add(key); return true;
  }).slice(-20);
}
