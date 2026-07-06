import { FiClock, FiCreditCard, FiLock } from "react-icons/fi";
import { AuthorizationDetailRow } from "@/components/tabs/AuthorizationDetailRow";
import { AuthorizationTechRow } from "@/components/tabs/AuthorizationTechRow";
import { formatUsdc } from "@/lib/tabs/money";
import { TABY_CHAIN_ID } from "@/lib/tabs/constants";
import { formatExpiry, shortHash } from "@/components/tabs/proposalUtils";
import type { TabAuthorizationResponse } from "@/lib/tabs/types";

type AuthorizationDetailRowsProps = {
  allowanceTxHash?: string | null;
  authorization?: TabAuthorizationResponse | null;
  capBaseUnits: string;
  expiresAt: string;
  maxSingleSettlementBaseUnits: string;
  owedBaseUnits: string;
  settlementContractAddress: string | null;
  tabTitle: string;
  tokenAddress: string;
};

export function AuthorizationDetailRows({
  allowanceTxHash,
  authorization,
  capBaseUnits,
  expiresAt,
  maxSingleSettlementBaseUnits,
  owedBaseUnits,
  settlementContractAddress,
  tabTitle,
  tokenAddress,
}: AuthorizationDetailRowsProps) {
  const txHash = allowanceTxHash ?? authorization?.allowanceTxHash ?? null;

  return (
    <div className="grid gap-3">
      <AuthorizationDetailRow label="You owe" value={formatUsdc(owedBaseUnits)} strong />
      <AuthorizationDetailRow label="Your tab cap" value={formatUsdc(capBaseUnits)} strong />
      <AuthorizationDetailRow
        label="Max for this settlement"
        value={formatUsdc(maxSingleSettlementBaseUnits)}
      />
      <AuthorizationDetailRow
        icon={<FiClock aria-hidden="true" />}
        label="Expires"
        value={formatExpiry(expiresAt)}
      />
      <AuthorizationDetailRow
        icon={<FiCreditCard aria-hidden="true" />}
        label="Token"
        value="USDC"
      />
      <AuthorizationDetailRow
        icon={<FiLock aria-hidden="true" />}
        label="Applies to"
        value={tabTitle}
      />
      <p className="rounded-md border border-primary-fixed bg-primary-soft px-3 py-2 text-sm font-semibold leading-6 text-primary-strong">
        This tab can never settle more than your cap.
      </p>
      <details className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-muted">
          Technical details
        </summary>
        <div className="mt-3 grid gap-2 text-xs leading-5 text-muted">
          <AuthorizationTechRow label="Token address" value={tokenAddress} />
          <AuthorizationTechRow
            label="Settlement contract"
            value={settlementContractAddress ?? "Not configured"}
          />
          <AuthorizationTechRow label="Chain id" value={String(TABY_CHAIN_ID)} />
          {txHash ? (
            <AuthorizationTechRow label="Authorization tx" value={shortHash(txHash)} />
          ) : null}
        </div>
      </details>
    </div>
  );
}
