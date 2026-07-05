"use client";

import { useMemo } from "react";
import {
  Background,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import { motion } from "motion/react";
import { SettlementMemberNode, type SettlementMemberFlowNode } from "@/components/tabs/SettlementMemberNode";
import {
  SettlementTransferEdge,
  type SettlementTransferFlowEdge,
} from "@/components/tabs/SettlementTransferEdge";
import type {
  SettlementGraphData,
  SettlementGraphEdge,
  SettlementGraphMode,
} from "@/lib/tabs/settlementGraph";

type SettlementGraphCanvasProps = {
  data: SettlementGraphData;
  mode: SettlementGraphMode;
  reducedMotion: boolean;
  selectedElementId: string | null;
  onSelectedElementChange: (id: string | null) => void;
};

const nodeTypes = {
  settlementMember: SettlementMemberNode,
} as NodeTypes;

const edgeTypes = {
  settlementTransfer: SettlementTransferEdge,
} as EdgeTypes;

const NODE_WIDTH = 176;
const NODE_HEIGHT = 112;
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 360;

export function SettlementGraphCanvas({
  data,
  mode,
  onSelectedElementChange,
  reducedMotion,
  selectedElementId,
}: SettlementGraphCanvasProps) {
  const activeEdges = mode === "before" ? data.beforeEdges : data.afterEdges;
  const relatedMemberIds = useMemo(
    () => getRelatedMemberIds(activeEdges, selectedElementId),
    [activeEdges, selectedElementId],
  );
  const nodes = useMemo(
    () =>
      data.members.map((member, index) => ({
        data: {
          ...member,
          highlighted: relatedMemberIds.has(member.id),
        },
        draggable: false,
        focusable: true,
        id: member.id,
        position: getNodePosition(member.id, index, data, mode),
        selectable: true,
        type: "settlementMember",
      })) satisfies SettlementMemberFlowNode[],
    [data, mode, relatedMemberIds],
  );
  const edges = useMemo(
    () =>
      activeEdges.map((edge) => ({
        data: {
          ...edge,
          highlighted:
            selectedElementId === edge.id ||
            selectedElementId === edge.fromMemberId ||
            selectedElementId === edge.toMemberId,
          reducedMotion,
        },
        deletable: false,
        focusable: true,
        id: edge.id,
        markerEnd: {
          color: edge.mode === "after" ? "var(--primary)" : "var(--neutral)",
          type: MarkerType.ArrowClosed,
        },
        reconnectable: false,
        selectable: true,
        source: edge.fromMemberId,
        target: edge.toMemberId,
        type: "settlementTransfer",
      })) satisfies SettlementTransferFlowEdge[],
    [activeEdges, reducedMotion, selectedElementId],
  );

  return (
    <motion.div
      key={mode}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest"
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.28 }}
    >
      <div className="overflow-x-auto">
        <div className="h-[330px] min-w-[680px] sm:h-[420px]">
          <ReactFlowProvider>
            <ReactFlow
              aria-label={
                mode === "after"
                  ? "Settlement graph showing final transfers"
                  : "Settlement graph showing confirmed expense IOUs"
              }
              colorMode="light"
              connectOnClick={false}
              deleteKeyCode={null}
              edges={edges}
              edgesReconnectable={false}
              edgeTypes={edgeTypes}
              elementsSelectable
              fitView
              fitViewOptions={{ maxZoom: 1.08, padding: 0.18 }}
              maxZoom={1.25}
              minZoom={0.55}
              nodes={nodes}
              nodesConnectable={false}
              nodesDraggable={false}
              nodeTypes={nodeTypes}
              panOnDrag
              preventScrolling={false}
              proOptions={{ hideAttribution: true }}
              zoomOnDoubleClick={false}
              zoomOnScroll={false}
              onEdgeClick={(_, edge) => onSelectedElementChange(edge.id)}
              onNodeClick={(_, node) => onSelectedElementChange(node.id)}
              onPaneClick={() => onSelectedElementChange(null)}
            >
              <Background color="var(--outline-variant)" gap={24} size={1} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </motion.div>
  );
}

function getRelatedMemberIds(edges: SettlementGraphEdge[], selectedElementId: string | null) {
  const memberIds = new Set<string>();

  if (!selectedElementId) {
    return memberIds;
  }

  for (const edge of edges) {
    if (
      edge.id === selectedElementId ||
      edge.fromMemberId === selectedElementId ||
      edge.toMemberId === selectedElementId
    ) {
      memberIds.add(edge.fromMemberId);
      memberIds.add(edge.toMemberId);
    }
  }

  return memberIds;
}

function getNodePosition(
  memberId: string,
  index: number,
  data: SettlementGraphData,
  mode: SettlementGraphMode,
) {
  if (mode === "before") {
    const radius = data.members.length <= 2 ? 140 : 154;
    const angle = (Math.PI * 2 * index) / Math.max(data.members.length, 1) - Math.PI / 2;

    return {
      x: CANVAS_WIDTH / 2 - NODE_WIDTH / 2 + Math.cos(angle) * radius,
      y: CANVAS_HEIGHT / 2 - NODE_HEIGHT / 2 + Math.sin(angle) * radius * 0.72,
    };
  }

  const debtors = data.members.filter((member) => member.balanceDirection === "pays");
  const creditors = data.members.filter((member) => member.balanceDirection === "receives");
  const settled = data.members.filter((member) => member.balanceDirection === "settled");
  const debtorIndex = debtors.findIndex((member) => member.id === memberId);
  const creditorIndex = creditors.findIndex((member) => member.id === memberId);
  const settledIndex = settled.findIndex((member) => member.id === memberId);

  if (debtorIndex >= 0) {
    return stackPosition(48, debtorIndex, debtors.length);
  }

  if (creditorIndex >= 0) {
    return stackPosition(496, creditorIndex, creditors.length);
  }

  return stackPosition(272, settledIndex, settled.length, 272);
}

function stackPosition(x: number, index: number, count: number, fallbackY = 122) {
  if (count <= 1) {
    return { x, y: fallbackY };
  }

  const spacing = Math.min(124, 260 / Math.max(count - 1, 1));

  return {
    x,
    y: CANVAS_HEIGHT / 2 - ((count - 1) * spacing) / 2 - NODE_HEIGHT / 2 + index * spacing,
  };
}
