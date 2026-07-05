"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FiCheckCircle, FiMinusCircle } from "react-icons/fi";
import { cn } from "@/lib/cn";
import type { SettlementGraphMember } from "@/lib/tabs/settlementGraph";

export type SettlementMemberNodeData = SettlementGraphMember & {
  highlighted: boolean;
} & Record<string, unknown>;

export type SettlementMemberFlowNode = Node<SettlementMemberNodeData, "settlementMember">;

export function SettlementMemberNode({ data, selected }: NodeProps<SettlementMemberFlowNode>) {
  const toneClasses =
    data.balanceDirection === "receives"
      ? "border-creditor/45 bg-primary-soft/70 text-creditor"
      : data.balanceDirection === "pays"
        ? "border-debtor/45 bg-secondary-soft/70 text-debtor"
        : "border-outline-variant bg-surface-container-lowest text-neutral";

  return (
    <div
      className={cn(
        "w-44 rounded-2xl border p-3 shadow-soft transition",
        toneClasses,
        selected || data.highlighted ? "ring-2 ring-primary-fixed" : "ring-0",
      )}
    >
      <Handle
        className="opacity-0"
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      <Handle
        className="opacity-0"
        isConnectable={false}
        position={Position.Right}
        type="source"
      />
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full border border-current bg-surface-container-lowest text-sm font-bold">
          {data.initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{data.displayName}</p>
          <p className="text-xs font-medium capitalize text-muted">{data.role}</p>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 text-xs font-semibold">
        {data.balanceDirection === "settled" ? (
          <FiCheckCircle aria-hidden="true" className="mt-0.5 shrink-0" />
        ) : (
          <FiMinusCircle aria-hidden="true" className="mt-0.5 shrink-0" />
        )}
        <span className="leading-5">{data.statusText}</span>
      </div>
    </div>
  );
}
