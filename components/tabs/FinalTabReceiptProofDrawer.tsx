"use client";

import { useState } from "react";
import { FiChevronDown, FiExternalLink, FiShield } from "react-icons/fi";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { ReceiptBlock } from "@/components/ui/ReceiptBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { cn } from "@/lib/cn";
import type { FinalTabReceiptProof } from "@/lib/tabs/types";
import { ReceiptCopyButton } from "./ReceiptCopyButton";

type FinalTabReceiptProofDrawerProps = {
  proof: FinalTabReceiptProof;
};

function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function ProofRow({
  copyLabel,
  label,
  value,
}: {
  copyLabel?: string;
  label: string;
  value: string | null;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-outline-variant bg-surface-container-lowest p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="min-w-0 break-all font-mono text-sm leading-6 text-foreground">
        {value ?? "Not available"}
      </p>
      {copyLabel && value ? <ReceiptCopyButton label={copyLabel} value={value} /> : null}
    </div>
  );
}

export function FinalTabReceiptProofDrawer({ proof }: FinalTabReceiptProofDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-lowest p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <FiShield aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold leading-7 text-foreground">Agreement proof</h2>
            <StatusChip tone="success">Verified</StatusChip>
          </div>
          <dl className="mt-3 grid gap-2 text-sm leading-6">
            <div className="flex flex-wrap justify-between gap-2 border-b border-outline-variant pb-2">
              <dt className="text-muted">Proposal</dt>
              <dd className="break-all font-mono text-foreground">{shortHash(proof.proposalHash)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-outline-variant pb-2">
              <dt className="text-muted">Authorized debtors</dt>
              <dd className="break-words text-right font-semibold text-foreground">
                {proof.authorizedDebtorCount > 0
                  ? proof.authorizedDebtors.join(", ")
                  : "No debtor authorization needed"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-outline-variant pb-2">
              <dt className="text-muted">Authorization expiry used</dt>
              <dd className="text-foreground">
                {proof.authorizationExpiryUsed
                  ? new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(proof.authorizationExpiryUsed))
                  : "Not available"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">Agreement version</dt>
              <dd className="font-mono text-foreground">{proof.agreementVersion}</dd>
            </div>
          </dl>
        </div>
      </div>

      <Button
        aria-expanded={open}
        aria-controls="receipt-proof-details"
        className="w-full sm:w-auto"
        icon={
          <FiChevronDown
            aria-hidden="true"
            className={cn("transition-transform", open ? "rotate-180" : "")}
          />
        }
        onClick={() => setOpen((current) => !current)}
        variant="secondary"
      >
        {open ? "Hide proof details" : "Show proof details"}
      </Button>

      {open ? (
        <motion.div
          animate={{ opacity: 1, height: "auto" }}
          className="overflow-hidden"
          id="receipt-proof-details"
          initial={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.18 }}
        >
          <ReceiptBlock label="Technical proof">
            <div className="grid gap-2">
              <ProofRow label="Network" value={proof.networkLabel} />
              <ProofRow label="Chain ID" value={proof.chainId.toString()} />
              <ProofRow copyLabel="token address" label="USDC address" value={proof.tokenAddress} />
              <ProofRow
                copyLabel="settlement contract address"
                label="TabySettlement"
                value={proof.settlementContractAddress}
              />
              <ProofRow copyLabel="proposal hash" label="Proposal hash" value={proof.proposalHash} />
              <ProofRow
                copyLabel="transaction hash"
                label="Transaction hash"
                value={proof.transactionHash}
              />
              <ProofRow label="Block number" value={proof.blockNumber} />
              <ProofRow label="Event" value={proof.eventName} />
              <ProofRow label="Tab key" value={proof.tabKey} />
              <ProofRow label="Transfers hash" value={proof.transfersHash} />
              {proof.explorerUrl ? (
                <div className="grid gap-2 rounded-md border border-outline-variant bg-surface-container-lowest p-3 sm:grid-cols-[10rem_1fr_auto_auto] sm:items-center">
                  <p className="text-sm font-semibold text-muted">Explorer</p>
                  <p className="min-w-0 break-all font-mono text-sm leading-6 text-foreground">
                    {proof.explorerUrl}
                  </p>
                  <ReceiptCopyButton label="explorer link" value={proof.explorerUrl} />
                  <a
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest px-3 text-sm font-semibold text-foreground transition hover:border-outline hover:bg-surface-container-low"
                    href={proof.explorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FiExternalLink aria-hidden="true" />
                    <span>View on Arbitrum</span>
                  </a>
                </div>
              ) : null}
            </div>
          </ReceiptBlock>
        </motion.div>
      ) : null}
    </section>
  );
}
