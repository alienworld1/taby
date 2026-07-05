"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { FiDollarSign } from "react-icons/fi";
import { MemberSplitPicker } from "@/components/tabs/MemberSplitPicker";
import { SplitMethodControl } from "@/components/tabs/SplitMethodControl";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";
import { Textarea } from "@/components/ui/Textarea";
import {
  equalSplitShares,
  formatSignedUsdc,
  formatUsdc,
  parseUsdcShareToBaseUnits,
  parseUsdcToBaseUnits,
} from "@/lib/tabs/money";
import type { TabClientError } from "@/lib/tabs/client";
import type { TabMemberResponse } from "@/lib/tabs/types";

export type AddExpenseInput = {
  amountBaseUnits: string;
  note?: string;
  payerMemberId: string;
  splitMethod: "equal" | "custom";
  splits: Array<{ memberId: string; shareBaseUnits?: string }>;
  title: string;
};

type AddExpenseSheetProps = {
  currentMember: TabMemberResponse | null;
  error: TabClientError | null;
  joinedMembers: TabMemberResponse[];
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AddExpenseInput) => Promise<boolean>;
};

type FieldErrors = Record<string, string>;

function trimOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function defaultPayerId(
  currentMember: TabMemberResponse | null,
  joinedMembers: TabMemberResponse[],
) {
  return currentMember?.joinStatus === "joined" ? currentMember.id : (joinedMembers[0]?.id ?? "");
}

export function AddExpenseSheet({
  currentMember,
  error,
  joinedMembers,
  loading,
  open,
  onOpenChange,
  onSubmit,
}: AddExpenseSheetProps) {
  const [amount, setAmount] = useState("");
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [note, setNote] = useState("");
  const [payerMemberId, setPayerMemberId] = useState(() =>
    defaultPayerId(currentMember, joinedMembers),
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState(() =>
    joinedMembers.map((member) => member.id),
  );
  const [splitMethod, setSplitMethod] = useState<"equal" | "custom">("equal");
  const [title, setTitle] = useState("");

  const amountBaseUnits = useMemo(() => parseUsdcToBaseUnits(amount), [amount]);
  const equalShares = useMemo(
    () =>
      amountBaseUnits && selectedMemberIds.length > 0
        ? equalSplitShares(amountBaseUnits, selectedMemberIds)
        : new Map<string, bigint>(),
    [amountBaseUnits, selectedMemberIds],
  );
  const customTotal = useMemo(() => {
    if (splitMethod !== "custom") {
      return BigInt(0);
    }

    return selectedMemberIds.reduce((sum, memberId) => {
      const parsed = parseUsdcShareToBaseUnits(customShares[memberId] ?? "");
      return parsed === null ? sum : sum + parsed;
    }, BigInt(0));
  }, [customShares, selectedMemberIds, splitMethod]);
  const customRemaining = amountBaseUnits === null ? null : amountBaseUnits - customTotal;

  function validate() {
    const nextErrors: FieldErrors = {};
    const trimmedTitle = title.trim();
    const trimmedNote = note.trim();
    const parsedAmount = parseUsdcToBaseUnits(amount);
    const joinedIds = new Set(joinedMembers.map((member) => member.id));

    if (trimmedTitle.length < 2 || trimmedTitle.length > 80) {
      nextErrors.title = "Name this expense.";
    }

    if (!parsedAmount) {
      nextErrors.amount = "Enter an amount greater than zero.";
    }

    if (!joinedIds.has(payerMemberId)) {
      nextErrors.payerMemberId = "Choose who paid.";
    }

    if (selectedMemberIds.length === 0) {
      nextErrors.selectedMemberIds = "Choose who should split this.";
    }

    if (trimmedNote.length > 240) {
      nextErrors.note = "Keep the note under 240 characters.";
    }

    if (splitMethod === "custom" && parsedAmount) {
      let total = BigInt(0);

      for (const memberId of selectedMemberIds) {
        const parsedShare = parseUsdcShareToBaseUnits(customShares[memberId] ?? "");

        if (parsedShare === null) {
          nextErrors[`share:${memberId}`] = "Enter a valid USDC amount.";
        } else {
          total += parsedShare;
        }
      }

      if (
        Object.keys(nextErrors).every((key) => !key.startsWith("share:")) &&
        total !== parsedAmount
      ) {
        nextErrors.customTotal = "The split needs to add up to the expense total.";
      }
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !parsedAmount) {
      return null;
    }

    return {
      amountBaseUnits: parsedAmount.toString(),
      note: trimOptional(note),
      payerMemberId,
      splitMethod,
      splits: selectedMemberIds.map((memberId) =>
        splitMethod === "equal"
          ? { memberId }
          : {
              memberId,
              shareBaseUnits: parseUsdcShareToBaseUnits(customShares[memberId] ?? "0")!.toString(),
            },
      ),
      title: trimmedTitle,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = validate();

    if (!input) {
      return;
    }

    const saved = await onSubmit(input);

    if (saved) {
      onOpenChange(false);
    }
  }

  return (
    <Sheet
      description="Choose who paid, who was involved, and how the cost should split."
      open={open}
      title="Add an expense"
      onOpenChange={onOpenChange}
    >
      <form className="grid max-h-[72vh] gap-4 overflow-y-auto pr-1" onSubmit={handleSubmit}>
        {error ? (
          <ErrorCallout message={error.message} title="We could not save this expense" />
        ) : null}
        <Input
          error={fieldErrors.title}
          label="What was it for?"
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Taxi from airport"
          required
          value={title}
        />
        <Input
          error={fieldErrors.amount}
          helperText="USDC, up to 6 decimal places."
          inputMode="decimal"
          label="Amount"
          onChange={(event) => setAmount(event.target.value)}
          placeholder="42.00"
          required
          value={amount}
        />
        <Select
          error={fieldErrors.payerMemberId}
          label="Paid by"
          onChange={(event) => setPayerMemberId(event.target.value)}
          required
          value={payerMemberId}
        >
          {joinedMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
        <SplitMethodControl value={splitMethod} onChange={setSplitMethod} />
        <MemberSplitPicker
          amountBaseUnits={amountBaseUnits}
          customShares={customShares}
          equalShares={equalShares}
          fieldErrors={fieldErrors}
          members={joinedMembers}
          selectedMemberIds={selectedMemberIds}
          splitMethod={splitMethod}
          onCustomShareChange={(memberId, value) =>
            setCustomShares((current) => ({ ...current, [memberId]: value }))
          }
          onToggleMember={(memberId) =>
            setSelectedMemberIds((current) =>
              current.includes(memberId)
                ? current.filter((selectedId) => selectedId !== memberId)
                : [...current, memberId],
            )
          }
        />
        {splitMethod === "custom" && customRemaining !== null ? (
          <p
            className={
              customRemaining === BigInt(0)
                ? "text-sm font-semibold text-primary-strong"
                : "text-sm font-semibold text-muted"
            }
          >
            {customRemaining === BigInt(0)
              ? "Split matches the total."
              : formatSignedUsdc(customRemaining)}
          </p>
        ) : null}
        {fieldErrors.customTotal ? (
          <p className="text-sm text-error">{fieldErrors.customTotal}</p>
        ) : null}
        {splitMethod === "equal" && amountBaseUnits && selectedMemberIds.length > 0 ? (
          <p className="text-sm text-muted">
            Taby will split {formatUsdc(amountBaseUnits)} across {selectedMemberIds.length} members.
          </p>
        ) : null}
        <Textarea
          error={fieldErrors.note}
          label="Note"
          maxLength={240}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional context for the group"
          value={note}
        />
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-3 bg-surface-container-lowest px-1 py-2">
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button icon={<FiDollarSign aria-hidden="true" />} loading={loading} type="submit">
            {loading ? "Saving expense" : "Save expense"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
