"use client";

import { FormEvent, useState } from "react";
import { FiCheck, FiLogOut, FiSave, FiUser } from "react-icons/fi";
import { motion } from "motion/react";
import { useAuth } from "@/components/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Account } from "@/lib/account/types";

type AccountProfileCardProps = {
  account: Account;
};

export function AccountProfileCard({ account }: AccountProfileCardProps) {
  const { signOut, updateDisplayName } = useAuth();
  const [displayName, setDisplayName] = useState(account.displayName);
  const [error, setError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(undefined);
    setSaved(false);

    const result = await updateDisplayName(displayName);

    setIsSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSaved(true);
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <FiUser aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Your Taby account.</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Your profile keeps shared tabs tied to the right person.
            </p>
          </div>
        </div>
        <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: -4 }}>
          <StatusChip tone="success">
            <FiCheck aria-hidden="true" className="mr-1" />
            Wallet ready
          </StatusChip>
        </motion.div>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <Input
          error={error}
          label="Display name"
          maxLength={40}
          minLength={2}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
        {account.email ? (
          <Input disabled label="Email" value={account.email} />
        ) : (
          <p className="rounded-md border border-outline-variant bg-surface-container-low p-4 text-sm text-muted">
            No email was shared during sign-in.
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button icon={<FiSave aria-hidden="true" />} loading={isSaving} type="submit">
            Save name
          </Button>
          <Button
            icon={<FiLogOut aria-hidden="true" />}
            onClick={signOut}
            type="button"
            variant="secondary"
          >
            Sign out
          </Button>
        </div>
        {saved ? <p className="text-sm font-semibold text-primary-strong">Saved.</p> : null}
      </form>
    </Card>
  );
}
