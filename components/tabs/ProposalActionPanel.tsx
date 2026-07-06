"use client";

import { FiFileText, FiLock, FiRefreshCcw, FiXCircle } from "react-icons/fi";
import type { ProposalBlocker } from "@/components/tabs/proposalUtils";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import type { TabClientError } from "@/lib/tabs/client";
import type { SettlementProposalResponse } from "@/lib/tabs/types";

type ProposalActionPanelProps = {
  action: "create" | "lock" | "cancel" | null;
  blockers: ProposalBlocker[];
  error: TabClientError | null;
  hasActiveProposal: boolean;
  loadingAction: "create" | "lock" | "cancel" | null;
  proposal: SettlementProposalResponse | null;
  onCancel: () => void;
  onCreate: () => void;
  onLock: () => void;
  onRefresh: () => void;
};

export function ProposalActionPanel({
  action,
  blockers,
  error,
  hasActiveProposal,
  loadingAction,
  proposal,
  onCancel,
  onCreate,
  onLock,
  onRefresh,
}: ProposalActionPanelProps) {
  const createDisabled = blockers.some((blocker) => blocker.blocksCreate) || hasActiveProposal;
  const lockDisabled = blockers.some((blocker) => blocker.blocksLock);
  const disabledReason = blockers.find((blocker) =>
    action === "create" ? blocker.blocksCreate : blocker.blocksLock,
  )?.message;

  return (
    <div className="grid gap-3">
      {error ? (
        <ErrorCallout
          action={
            <Button icon={<FiRefreshCcw aria-hidden="true" />} onClick={onRefresh}>
              Refresh
            </Button>
          }
          message={error.message}
          title={
            action === "create"
              ? "We could not create the proposal."
              : "We could not update the proposal."
          }
        />
      ) : null}

      {!proposal ? (
        <div className="grid gap-3">
          <Button
            className="w-full sm:w-auto"
            disabled={createDisabled}
            icon={<FiFileText aria-hidden="true" />}
            loading={loadingAction === "create"}
            onClick={onCreate}
          >
            {loadingAction === "create" ? "Creating proposal" : "Create proposal"}
          </Button>
          {disabledReason ? <p className="text-sm leading-6 text-muted">{disabledReason}</p> : null}
        </div>
      ) : null}

      {proposal?.status === "open" ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              disabled={lockDisabled}
              icon={<FiLock aria-hidden="true" />}
              loading={loadingAction === "lock"}
              onClick={onLock}
            >
              {loadingAction === "lock" ? "Locking proposal" : "Lock proposal"}
            </Button>
            <Button
              disabled={loadingAction !== null}
              icon={<FiXCircle aria-hidden="true" />}
              onClick={onCancel}
              variant="secondary"
            >
              Cancel proposal
            </Button>
          </div>
          {disabledReason ? <p className="text-sm leading-6 text-muted">{disabledReason}</p> : null}
        </div>
      ) : null}

      {proposal?.status === "locked" ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <p className="text-sm leading-6 text-muted">
            Included expenses are locked in this proposal. Cancel it before settlement starts to edit them.
          </p>
          <Button
            disabled={loadingAction !== null}
            icon={<FiXCircle aria-hidden="true" />}
            onClick={onCancel}
            variant="secondary"
          >
            Cancel proposal
          </Button>
        </div>
      ) : null}
    </div>
  );
}
