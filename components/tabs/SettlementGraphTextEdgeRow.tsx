"use client";

import { FiArrowRight } from "react-icons/fi";
import { motion } from "motion/react";
import type { SettlementGraphData, SettlementGraphEdge } from "@/lib/tabs/settlementGraph";

type SettlementGraphTextEdgeRowProps = {
  data: SettlementGraphData;
  edge: SettlementGraphEdge;
  reducedMotion: boolean;
};

export function SettlementGraphTextEdgeRow({
  data,
  edge,
  reducedMotion,
}: SettlementGraphTextEdgeRowProps) {
  const fromName =
    data.members.find((member) => member.id === edge.fromMemberId)?.displayName ?? "Someone";
  const toName =
    data.members.find((member) => member.id === edge.toMemberId)?.displayName ?? "Someone";

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center"
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      layout={!reducedMotion}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
    >
      <span className="min-w-0 wrap-break-word text-sm font-medium text-debtor">
        {fromName} pays
      </span>
      <FiArrowRight aria-hidden="true" className="hidden text-muted sm:block" />
      <span className="min-w-0 wrap-break-word text-sm font-medium text-creditor">
        {toName}
      </span>
      <span className="text-sm font-semibold text-foreground sm:text-right">
        {edge.label}
        {edge.isAggregated ? (
          <span className="mt-0.5 block text-xs font-medium text-muted">{edge.subtitle}</span>
        ) : null}
      </span>
    </motion.div>
  );
}
