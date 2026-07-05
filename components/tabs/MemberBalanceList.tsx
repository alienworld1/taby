import { FiCheckCircle, FiMinusCircle } from "react-icons/fi";
import { formatUsdc } from "@/lib/tabs/money";
import type { MemberNetBalance } from "@/lib/tabs/settlement";

type MemberBalanceListProps = {
  balances: MemberNetBalance[];
};

export function MemberBalanceList({ balances }: MemberBalanceListProps) {
  const zero = BigInt(0);

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold text-foreground">Member balances</h3>
      <div className="divide-y divide-outline-variant rounded-md border border-outline-variant bg-surface-container-low">
        {balances.map((balance) => {
          const net = BigInt(balance.netBaseUnits);
          const amount = net < zero ? -net : net;
          const tone =
            balance.direction === "receives"
              ? "text-creditor"
              : balance.direction === "pays"
                ? "text-debtor"
                : "text-neutral";
          const copy =
            balance.direction === "receives"
              ? `${balance.displayName} receives ${formatUsdc(amount)}.`
              : balance.direction === "pays"
                ? `${balance.displayName} pays ${formatUsdc(amount)}.`
                : `${balance.displayName} is settled.`;

          return (
            <div
              key={balance.memberId}
              className="flex min-h-11 items-center gap-3 px-4 py-3"
            >
              {balance.direction === "settled" ? (
                <FiCheckCircle aria-hidden="true" className="shrink-0 text-neutral" />
              ) : (
                <FiMinusCircle aria-hidden="true" className={`shrink-0 ${tone}`} />
              )}
              <p className={`min-w-0 break-words text-sm font-medium ${tone}`}>{copy}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
