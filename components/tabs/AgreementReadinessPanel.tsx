"use client";

import { FiAlertCircle, FiCheckCircle, FiClock, FiFileText, FiRefreshCcw, FiUserCheck } from "react-icons/fi";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { usePrefersReducedMotion } from "@/components/tabs/usePrefersReducedMotion";
import type { AgreementBlockerResponse, AgreementReadinessResponse } from "@/lib/tabs/types";

type AgreementReadinessPanelProps = { currentMemberId: string | null; readiness: AgreementReadinessResponse; tabId: string; onRefresh: () => void };
const icons = { agreement: FiFileText, execution: FiUserCheck, context: FiAlertCircle };

function scrollTo(targetId: string) { document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
function actionTarget(action: AgreementBlockerResponse["action"]) { return action === "review_expenses" ? "expenses" : action === "review_final_tab" || action === "review_settlement" ? "final-tab" : action === "approve_amount" ? "settlement-authorization-heading" : null; }
function label(stage: AgreementReadinessResponse["stage"]) { return ({ needs_review: "Needs review", awaiting_approval: "Awaiting approval", ready_to_settle: "Ready to settle", settling: "Confirming", settled: "Settled", needs_refresh: "Needs attention" })[stage]; }
function tone(stage: AgreementReadinessResponse["stage"]): "error" | "pending" | "success" | "warning" { return stage === "settled" || stage === "ready_to_settle" ? "success" : stage === "needs_refresh" ? "error" : stage === "settling" ? "pending" : "warning"; }

export function AgreementReadinessPanel({ currentMemberId, readiness, tabId, onRefresh }: AgreementReadinessPanelProps) {
  const reducedMotion = usePrefersReducedMotion();
  const groups = [["Needs group agreement", readiness.groupBlockers], ["Settlement readiness", readiness.executionBlockers]] as const;
  return <motion.section aria-labelledby="agreement-readiness-heading" animate={{ opacity: 1, y: 0 }} className="scroll-mt-5" initial={reducedMotion ? false : { opacity: 0, y: 8 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
    <Card className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="agreement-readiness-heading" className="text-xl font-semibold text-foreground">What needs attention</h2><p aria-live="polite" className="mt-1 text-sm font-medium leading-6 text-foreground">{readiness.headline}</p></div><StatusChip tone={tone(readiness.stage)}>{label(readiness.stage)}</StatusChip></div>
      {groups.map(([heading, blockers]) => blockers.length ? <section aria-labelledby={`${heading}-heading`} className="grid gap-2" key={heading}><h3 id={`${heading}-heading`} className="text-sm font-semibold text-muted">{heading}</h3><ul className="grid gap-2">{blockers.map((blocker) => { const Icon = icons[blocker.category]; const target = actionTarget(blocker.action); const actionable = blocker.action !== "approve_amount" || blocker.memberId === currentMemberId; return <li className="flex flex-col gap-2 rounded-md border border-outline-variant bg-surface-container-low px-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={blocker.id}><span className="flex min-w-0 gap-2 text-sm leading-6 text-foreground"><Icon aria-hidden="true" className="mt-1 shrink-0 text-primary" />{blocker.message}</span>{blocker.action === "refresh_status" ? <Button icon={<FiRefreshCcw aria-hidden="true" />} onClick={onRefresh} size="sm" variant="secondary">Refresh status</Button> : target && actionable ? <Button onClick={() => scrollTo(target)} size="sm" variant="secondary">{blocker.action === "approve_amount" ? "Approve your amount" : blocker.action === "review_expenses" ? "Review expenses" : blocker.action === "review_settlement" ? "Review settlement" : "Review Final Tab"}</Button> : null}</li>; })}</ul></section> : null)}
      {readiness.contextItems.length ? <ul className="grid gap-2">{readiness.contextItems.map((item) => <li className="flex gap-2 text-sm leading-6 text-muted" key={item.id}><FiAlertCircle aria-hidden="true" className="mt-1 shrink-0 text-secondary" />{item.message}</li>)}</ul> : null}
      {readiness.stage === "settled" ? <ButtonLink href={`/tabs/${tabId}/receipt`} icon={<FiCheckCircle aria-hidden="true" />} variant="primary">View receipt</ButtonLink> : null}
      {readiness.stage === "settling" ? <p className="flex items-center gap-2 text-sm text-muted"><FiClock aria-hidden="true" />Refresh status before taking another step.</p> : null}
    </Card>
  </motion.section>;
}
