"use client";

import { FiInfo } from "react-icons/fi";
import { ReceiptBlock } from "@/components/ui/ReceiptBlock";
import { shortHash } from "@/components/tabs/proposalUtils";
import type { SettlementPreviewSnapshot } from "@/lib/tabs/types";

type SettlementPreviewTechnicalDetailsProps = {
  snapshot: SettlementPreviewSnapshot;
};

export function SettlementPreviewTechnicalDetails({
  snapshot,
}: SettlementPreviewTechnicalDetailsProps) {
  return (
    <details className="group rounded-md border border-outline-variant bg-surface-container-lowest p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
        <FiInfo aria-hidden="true" className="text-muted" />
        Technical details
      </summary>
      <div className="mt-4">
        <ReceiptBlock label="Technical details">
          <dl className="grid gap-3">
            <div className="grid gap-1">
              <dt className="text-xs uppercase text-muted">Network</dt>
              <dd className="break-words">
                {snapshot.networkName} ({snapshot.networkChainId})
              </dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-xs uppercase text-muted">Token</dt>
              <dd className="break-all">USDC {snapshot.tokenAddress}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-xs uppercase text-muted">Settlement contract</dt>
              <dd className="break-all">{snapshot.settlementContractAddress}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-xs uppercase text-muted">Final Tab hash</dt>
              <dd className="break-words">{shortHash(snapshot.proposalHash)}</dd>
            </div>
          </dl>
        </ReceiptBlock>
      </div>
    </details>
  );
}
