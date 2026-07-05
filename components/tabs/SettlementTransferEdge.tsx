"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { cn } from "@/lib/cn";
import type { SettlementGraphEdge } from "@/lib/tabs/settlementGraph";

export type SettlementTransferEdgeData = SettlementGraphEdge & {
  highlighted: boolean;
  reducedMotion: boolean;
} & Record<string, unknown>;

export type SettlementTransferFlowEdge = Edge<SettlementTransferEdgeData, "settlementTransfer">;

export function SettlementTransferEdge({
  data,
  id,
  markerEnd,
  selected,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<SettlementTransferFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    curvature: data?.mode === "before" ? 0.34 : 0.2,
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
  const highlighted = selected || data?.highlighted;
  const stroke =
    data?.mode === "after"
      ? "var(--primary)"
      : data?.isAggregated
        ? "var(--coral)"
        : "var(--neutral)";

  return (
    <>
      <BaseEdge
        id={id}
        className={cn(
          "transition-opacity",
          data?.mode === "after" && !data.reducedMotion ? "settlement-flow-edge" : "",
        )}
        interactionWidth={18}
        markerEnd={markerEnd}
        path={edgePath}
        style={{
          opacity: highlighted ? 1 : 0.82,
          stroke,
          strokeDasharray: data?.mode === "before" ? "5 7" : "12 8",
          strokeWidth: highlighted ? 3 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border bg-surface-container-lowest px-2.5 py-1 text-xs font-semibold shadow-soft",
            data?.mode === "after"
              ? "border-primary-fixed text-primary-strong"
              : "border-outline-variant text-muted",
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
