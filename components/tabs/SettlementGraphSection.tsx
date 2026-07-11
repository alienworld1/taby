"use client";

import { useMemo, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiRepeat, FiUsers } from "react-icons/fi";
import { AnimatePresence, motion } from "motion/react";
import { ExcludedExpensesSummary } from "@/components/tabs/ExcludedExpensesSummary";
import { SettlementGraphCanvas } from "@/components/tabs/SettlementGraphCanvas";
import { SettlementGraphModeControl } from "@/components/tabs/SettlementGraphModeControl";
import { SettlementGraphTextFallback } from "@/components/tabs/SettlementGraphTextFallback";
import { usePrefersReducedMotion } from "@/components/tabs/usePrefersReducedMotion";
import type { SettlementEngineResult } from "@/lib/tabs/settlement";
import {
  buildSettlementGraphData,
  type SettlementGraphMode,
} from "@/lib/tabs/settlementGraph";
import type { TabDetailResponse } from "@/lib/tabs/types";

type SettlementGraphSectionProps = {
  detail: TabDetailResponse;
  settlement: SettlementEngineResult;
  settlementPreviewActive?: boolean;
};

export function SettlementGraphSection({
  detail,
  settlement,
  settlementPreviewActive = false,
}: SettlementGraphSectionProps) {
  const reducedMotion = usePrefersReducedMotion();
  const graphResult = useMemo(
    () => buildSettlementGraphData(detail, settlement),
    [detail, settlement],
  );
  const graphData = graphResult.ok ? graphResult.data : graphResult.fallbackData;
  const defaultMode = settlement.transfers.length > 0 ? "after" : "before";
  const [mode, setMode] = useState<SettlementGraphMode>(defaultMode);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const modeHelper =
    mode === "before"
      ? "Accepted expenses created these obligations."
      : "These final transfers close the agreed Final Tab.";
  const canRenderCanvas = graphResult.ok && graphData.members.length >= 2;
  const isEven = settlement.settlementCount === 0;

  function handleModeChange(nextMode: SettlementGraphMode) {
    setMode(nextMode);
    setSelectedElementId(null);
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong">
            {isEven ? <FiCheckCircle aria-hidden="true" /> : <FiRepeat aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <motion.p
              key={isEven ? "Everyone is even." : settlement.summaryText}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-semibold leading-8 text-foreground"
              initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            >
              {isEven ? "Everyone is even." : settlement.summaryText}
            </motion.p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Only agreed expenses count. This graph supports the Final Tab above.
            </p>
          </div>
        </div>
        <SettlementGraphModeControl
          disabled={graphData.beforeEdges.length === 0 && graphData.afterEdges.length === 0}
          mode={mode}
          reducedMotion={reducedMotion}
          onModeChange={handleModeChange}
        />
      </div>

      <p className="text-sm leading-6 text-muted">{modeHelper}</p>

      {!graphResult.ok ? (
        <div
          aria-live="polite"
          className="rounded-md border border-error-container bg-error-container/55 p-4 text-on-error-container"
          role="alert"
        >
          <div className="flex gap-3">
            <FiAlertCircle aria-hidden="true" className="mt-1 shrink-0" />
            <div>
              <h3 className="font-semibold">We could not draw the settlement graph.</h3>
              <p className="mt-1 text-sm leading-6">The settlement details are still available below.</p>
            </div>
          </div>
        </div>
      ) : null}

      {graphData.members.length < 2 ? (
        <div className="rounded-md border border-outline-variant bg-surface-container-low px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <FiUsers aria-hidden="true" className="shrink-0 text-neutral" />
            Add another joined member before a graph can show group activity.
          </p>
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {canRenderCanvas ? (
          <SettlementGraphCanvas
            key={mode}
            data={graphData}
            mode={mode}
            reducedMotion={reducedMotion}
            selectedElementId={selectedElementId}
            settlementPreviewActive={settlementPreviewActive}
            onSelectedElementChange={setSelectedElementId}
          />
        ) : null}
      </AnimatePresence>

      <SettlementGraphTextFallback data={graphData} mode={mode} reducedMotion={reducedMotion} />
      <ExcludedExpensesSummary
        expenses={graphData.excludedExpenses}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
