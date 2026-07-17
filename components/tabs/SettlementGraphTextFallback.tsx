"use client";

import { FiCheckCircle, FiEye } from "react-icons/fi";
import { SettlementGraphTextEdgeRow } from "@/components/tabs/SettlementGraphTextEdgeRow";
import type {
  SettlementGraphData,
  SettlementGraphMode,
} from "@/lib/tabs/settlementGraph";

type SettlementGraphTextFallbackProps = {
  data: SettlementGraphData;
  mode: SettlementGraphMode;
  reducedMotion: boolean;
};

export function SettlementGraphTextFallback({
  data,
  mode,
  reducedMotion,
}: SettlementGraphTextFallbackProps) {
  const edges = mode === "before" ? data.beforeEdges : data.afterEdges;
  const title = mode === "before" ? "Confirmed IOUs" : "Final transfers";
  const emptyCopy =
    mode === "after"
      ? "The confirmed expenses cancel out, so there is nothing to settle."
      : "There are no expense IOUs to list yet.";

  return (
    <div className="grid gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FiEye aria-hidden="true" className="text-primary" />
        {title}
      </h3>
      {edges.length === 0 ? (
        <div className="rounded-md border border-outline-variant bg-surface-container-low px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral">
            <FiCheckCircle aria-hidden="true" className="shrink-0" />
            {emptyCopy}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-outline-variant rounded-md border border-outline-variant bg-surface-container-lowest">
          {edges.map((edge) => (
            <SettlementGraphTextEdgeRow
              key={edge.id}
              data={data}
              edge={edge}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      )}
    </div>
  );
}
