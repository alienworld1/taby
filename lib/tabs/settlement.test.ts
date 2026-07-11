import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateSettlement,
  type SettlementEngineInput,
  type SettlementEngineResult,
} from "./settlement";
import { buildFinalTab, hashFinalTabPayload } from "./finalTab";
import {
  canViewFinalTabReceipt,
  parseReceiptSnapshots,
  receiptLifecycleState,
  receiptVerificationPassed,
  validReceiptAuthorizations,
  type ReceiptTransferSnapshot,
} from "./receipt";

const members = [
  member("a", "Alex"),
  member("b", "Bela"),
  member("c", "Cy"),
  member("d", "Dee"),
  member("e", "Ezra"),
  member("f", "Fran"),
];

test("calculates confirmed expenses, raw IOUs, balances, and transfers", () => {
  const result = mustCalculate({
    expenses: [
      expense("e1", "a", "90000000"),
      expense("e2", "b", "30000000"),
      expense("e3", "c", "12000000"),
      { ...expense("pending", "a", "99000000"), status: "pending" },
    ],
    members: members.slice(0, 3),
    splits: [
      split("e1", "a", "30000000"),
      split("e1", "b", "30000000"),
      split("e1", "c", "30000000"),
      split("e2", "a", "15000000"),
      split("e2", "c", "15000000"),
      split("e3", "a", "4000000"),
      split("e3", "b", "4000000"),
      split("e3", "c", "4000000"),
      split("pending", "a", "99000000"),
    ],
    tokenAddress: "usdc",
  });

  assert.equal(result.rawIouCount, 6);
  assert.equal(result.excludedExpenseIds.length, 1);
  assert.equal(result.settlementCount, 2);
  assert.equal(result.totalMovingBaseUnits, "41000000");
  assert.deepEqual(
    result.balances.map((balance) => [balance.memberId, balance.netBaseUnits]),
    [
      ["a", "41000000"],
      ["b", "-4000000"],
      ["c", "-37000000"],
    ],
  );
  assertSettlementInvariants(result);
});

test("returns no settlement when there are no confirmed expenses", () => {
  const result = mustCalculate({
    expenses: [{ ...expense("e1", "a", "1000000"), status: "disputed" }],
    members: members.slice(0, 2),
    splits: [split("e1", "a", "1000000")],
    tokenAddress: "usdc",
  });

  assert.equal(result.rawIouCount, 0);
  assert.equal(result.settlementCount, 0);
  assert.equal(result.algorithm, "none");
  assertSettlementInvariants(result);
});

test("handles all-even confirmed expenses", () => {
  const result = mustCalculate({
    expenses: [expense("e1", "a", "1000000"), expense("e2", "b", "1000000")],
    members: members.slice(0, 2),
    splits: [
      split("e1", "b", "1000000"),
      split("e2", "a", "1000000"),
    ],
    tokenAddress: "usdc",
  });

  assert.equal(result.summaryText, "Everyone is even.");
  assert.equal(result.transfers.length, 0);
  assert.equal(result.algorithm, "none");
  assertSettlementInvariants(result);
});

test("nets a simple two-member transfer graph", () => {
  const result = mustCalculate({
    expenses: [expense("coffee", "a", "24000000")],
    members: members.slice(0, 2),
    splits: [
      split("coffee", "a", "12000000"),
      split("coffee", "b", "12000000"),
    ],
    tokenAddress: "usdc",
  });

  assertBalances(result, {
    a: "12000000",
    b: "-12000000",
  });
  assert.deepEqual(transferTriples(result), [["b", "a", "12000000"]]);
  assert.equal(result.rawIouCount, 1);
  assert.equal(result.settlementCount, 1);
  assertSettlementInvariants(result);
});

test("nets a small crossing graph into fewer final transfers", () => {
  const result = mustCalculate({
    expenses: [
      expense("stay", "a", "120000000"),
      expense("groceries", "b", "45000000"),
      expense("taxi", "c", "27000000"),
      expense("tickets", "d", "64000000"),
    ],
    members: members.slice(0, 4),
    splits: [
      split("stay", "a", "30000000"),
      split("stay", "b", "30000000"),
      split("stay", "c", "30000000"),
      split("stay", "d", "30000000"),
      split("groceries", "a", "15000000"),
      split("groceries", "b", "15000000"),
      split("groceries", "d", "15000000"),
      split("taxi", "a", "9000000"),
      split("taxi", "b", "9000000"),
      split("taxi", "c", "9000000"),
      split("tickets", "a", "16000000"),
      split("tickets", "b", "16000000"),
      split("tickets", "c", "16000000"),
      split("tickets", "d", "16000000"),
    ],
    tokenAddress: "usdc",
  });

  assertBalances(result, {
    a: "50000000",
    b: "-25000000",
    c: "-28000000",
    d: "3000000",
  });
  assert.equal(result.rawIouCount, 10);
  assert.equal(result.settlementCount, 3);
  assert.equal(result.totalMovingBaseUnits, "53000000");
  assertSettlementInvariants(result);
});

test("handles a realistic trip graph with dust, zero shares, and excluded expenses", () => {
  const tripMembers = [
    member("owner", "Mira"),
    member("roommate", "Noah"),
    member("planner", "Isha"),
    member("driver", "Leo"),
    member("guest", "Sam"),
  ];
  const result = mustCalculate({
    expenses: [
      expense("villa", "owner", "33333333"),
      expense("dinner", "roommate", "8750000"),
      expense("supplies", "planner", "19300000"),
      expense("fuel", "driver", "4100000"),
      { ...expense("unreviewed", "guest", "5000000"), status: "pending" },
      { ...expense("questioned", "owner", "7000000"), status: "disputed" },
    ],
    members: tripMembers,
    splits: [
      split("villa", "owner", "6666667"),
      split("villa", "roommate", "6666667"),
      split("villa", "planner", "6666667"),
      split("villa", "driver", "6666666"),
      split("villa", "guest", "6666666"),
      split("dinner", "owner", "1750000"),
      split("dinner", "roommate", "1750000"),
      split("dinner", "planner", "1750000"),
      split("dinner", "driver", "1750000"),
      split("dinner", "guest", "1750000"),
      split("supplies", "owner", "4500000"),
      split("supplies", "roommate", "5800000"),
      split("supplies", "planner", "0"),
      split("supplies", "driver", "4500000"),
      split("supplies", "guest", "4500000"),
      split("fuel", "owner", "1025000"),
      split("fuel", "roommate", "1025000"),
      split("fuel", "planner", "1025000"),
      split("fuel", "driver", "1025000"),
      split("unreviewed", "guest", "5000000"),
      split("questioned", "owner", "7000000"),
    ],
    tokenAddress: "usdc",
  });

  assertBalances(result, {
    driver: "-9841666",
    guest: "-12916666",
    owner: "19391666",
    planner: "9858333",
    roommate: "-6491667",
  });
  assert.equal(result.excludedExpenseIds.length, 2);
  assert.equal(result.rawIouCount, 15);
  assert.equal(result.totalMovingBaseUnits, "29249999");
  assertSettlementInvariants(result);
});

test("builds ABI-compatible Final Tab hash vectors", () => {
  const vector = finalTabVector();

  assert.equal(
    vector.finalTab.proposalHash,
    "0xbce86c4312bb1677def3be989993ecbdaff3ee18966426fd0dbd4c0b5269a7cb",
  );
  assert.equal(
    vector.finalTab.includedExpensesHash,
    "0xacb371cd6d4dcd71a67a09d04888d4c6b37180b0bef96be428225fb69c9ce63b",
  );
  assert.equal(
    vector.finalTab.excludedExpensesHash,
    "0x92fd7ed3639a058a3940e1a80c61e19cc9edcc6401f18baa8fa45a113d1eddbf",
  );
  assert.equal(
    vector.finalTab.transfersHash,
    "0x203cb1d323e5c7e230ee43da6dfcfa508c4a7ddb11346d4c50b477b643008467",
  );
});

test("Final Tab hash ignores presentation ordering but changes for material edits", () => {
  const vector = finalTabVector();
  const reordered = buildFinalTab({
    ...vector.input,
    excludedExpenses: [...vector.input.excludedExpenses].reverse(),
    includedExpenses: [...vector.input.includedExpenses].reverse(),
    members: [...vector.input.members].reverse(),
    settlement: {
      ...vector.input.settlement,
      balances: [...vector.input.settlement.balances].reverse(),
      transfers: [...vector.input.settlement.transfers].reverse(),
    },
    splits: [...vector.input.splits].reverse(),
  });
  const changed = buildFinalTab({
    ...vector.input,
    settlement: {
      ...vector.input.settlement,
      totalMovingBaseUnits: "14000001",
      transfers: vector.input.settlement.transfers.map((transfer, index) =>
        index === 0 ? { ...transfer, amountBaseUnits: "10000001" } : transfer,
      ),
    },
  });
  const changedVersion = buildFinalTab({
    ...vector.input,
    proposalVersion: vector.input.proposalVersion + 1,
  });

  assert.equal(reordered.proposalHash, vector.finalTab.proposalHash);
  assert.notEqual(changed.proposalHash, vector.finalTab.proposalHash);
  assert.notEqual(changedVersion.proposalHash, vector.finalTab.proposalHash);
  assert.equal(hashFinalTabPayload(vector.finalTab.payload), vector.finalTab.proposalHash);
});

test("receipt lifecycle state keeps unconfirmed attempts out of confirmed copy", () => {
  assert.equal(receiptLifecycleState(null), "empty");
  assert.equal(receiptLifecycleState({ status: "submitted", txHash: null }), "pending");
  assert.equal(
    receiptLifecycleState({ status: "unknown", txHash: "0xabc" }),
    "reconciliation_needed",
  );
  assert.equal(receiptLifecycleState({ status: "failed", txHash: "0xabc" }), "failed");
  assert.equal(
    receiptLifecycleState({ status: "confirmed", txHash: "0xabc" }),
    "reconciliation_needed",
  );
});

test("receipt access predicate denies non-members without data disclosure", () => {
  assert.equal(
    canViewFinalTabReceipt({ currentMember: { joinStatus: "joined" }, isOwner: false }),
    true,
  );
  assert.equal(
    canViewFinalTabReceipt({ currentMember: { joinStatus: "invited" }, isOwner: false }),
    false,
  );
  assert.equal(canViewFinalTabReceipt({ currentMember: null, isOwner: false }), false);
  assert.equal(canViewFinalTabReceipt({ currentMember: null, isOwner: true }), true);
});

test("receipt verification accepts only matching confirmed settlement events", () => {
  const confirmedInput = receiptVerificationInput();

  assert.equal(receiptVerificationPassed(confirmedInput), true);
  assert.equal(
    receiptVerificationPassed({
      ...confirmedInput,
      transaction: {
        ...confirmedInput.transaction,
        eventProposalHash: "0xdifferent",
      },
    }),
    false,
  );
  assert.equal(
    receiptVerificationPassed({
      ...confirmedInput,
      transaction: {
        ...confirmedInput.transaction,
        status: "included",
      },
    }),
    false,
  );
});

test("receipt snapshots reject malformed or mismatched locked data", () => {
  const validPayload = {
    excludedExpenses: [{ expenseId: "excluded-1", status: "disputed" }],
    includedExpenses: [{ amountBaseUnits: "12000000", expenseId: "included-1" }],
  };
  const transfers = [{ amountBaseUnits: "12000000", fromMemberId: "debtor", toMemberId: "creditor" }];
  const netBalances = [
    { memberId: "debtor", netBaseUnits: "-12000000" },
    { memberId: "creditor", netBaseUnits: "12000000" },
  ];

  assert.equal(
    parseReceiptSnapshots({
      canonicalPayloadJson: validPayload,
      excludedExpenseIds: ["excluded-1"],
      includedExpenseIds: ["included-1"],
      netBalancesJson: netBalances,
      transfersJson: transfers,
    }).ok,
    true,
  );
  assert.equal(
    parseReceiptSnapshots({
      canonicalPayloadJson: {
        ...validPayload,
        includedExpenses: [{ amountBaseUnits: "12000000" }],
      },
      excludedExpenseIds: ["excluded-1"],
      includedExpenseIds: ["included-1"],
      netBalancesJson: netBalances,
      transfersJson: transfers,
    }).ok,
    false,
  );
  assert.equal(
    parseReceiptSnapshots({
      canonicalPayloadJson: validPayload,
      excludedExpenseIds: ["excluded-1"],
      includedExpenseIds: ["different-expense"],
      netBalancesJson: netBalances,
      transfersJson: transfers,
    }).ok,
    false,
  );
});

test("receipt authorization proof counts only matching unrevoked coverage", () => {
  const proposalHash = "0xproposal";
  const proposalExecutedAt = new Date("2026-07-10T12:00:00.000Z");
  const transfers: ReceiptTransferSnapshot[] = [
    { amountBaseUnits: "7000000", fromMemberId: "debtor", toMemberId: "creditor-a" },
    { amountBaseUnits: "5000000", fromMemberId: "debtor", toMemberId: "creditor-b" },
  ];

  const valid = validReceiptAuthorizations({
    authorizationRows: [
      receiptAuthorization({
        authorizationAmountBaseUnits: BigInt("11999999"),
        memberId: "debtor",
        proposalHash,
      }),
      receiptAuthorization({
        authorizationAmountBaseUnits: BigInt("12000000"),
        memberId: "debtor",
        proposalHash: "0xother",
      }),
      receiptAuthorization({
        authorizationAmountBaseUnits: BigInt("12000000"),
        expiresAt: new Date("2026-07-10T11:59:59.000Z"),
        memberId: "debtor",
        proposalHash,
      }),
      receiptAuthorization({
        authorizationAmountBaseUnits: BigInt("12000000"),
        memberId: "debtor",
        proposalHash,
        revokedAt: new Date("2026-07-10T11:00:00.000Z"),
      }),
      receiptAuthorization({
        authorizationAmountBaseUnits: BigInt("12000000"),
        memberId: "debtor",
        proposalHash,
      }),
    ],
    proposalExecutedAt,
    proposalHash,
    transfers,
  });

  assert.equal(valid.length, 1);
  assert.equal(valid[0]?.memberId, "debtor");
});

test("handles a complex reciprocal graph where many raw IOUs cancel out", () => {
  const result = mustCalculate({
    expenses: [
      expense("a-paid-b", "a", "5000000"),
      expense("b-paid-a", "b", "5000000"),
      expense("c-paid-everyone", "c", "30000000"),
      expense("d-paid-abc", "d", "21000000"),
      expense("e-paid-cdf", "e", "18000000"),
      expense("f-paid-ab", "f", "9000000"),
    ],
    members,
    splits: [
      split("a-paid-b", "b", "5000000"),
      split("b-paid-a", "a", "5000000"),
      split("c-paid-everyone", "a", "5000000"),
      split("c-paid-everyone", "b", "5000000"),
      split("c-paid-everyone", "c", "5000000"),
      split("c-paid-everyone", "d", "5000000"),
      split("c-paid-everyone", "e", "5000000"),
      split("c-paid-everyone", "f", "5000000"),
      split("d-paid-abc", "a", "7000000"),
      split("d-paid-abc", "b", "7000000"),
      split("d-paid-abc", "c", "7000000"),
      split("e-paid-cdf", "c", "6000000"),
      split("e-paid-cdf", "d", "6000000"),
      split("e-paid-cdf", "f", "6000000"),
      split("f-paid-ab", "a", "4500000"),
      split("f-paid-ab", "b", "4500000"),
    ],
    tokenAddress: "usdc",
  });

  assertBalances(result, {
    a: "-16500000",
    b: "-16500000",
    c: "12000000",
    d: "10000000",
    e: "13000000",
    f: "-2000000",
  });
  assert.equal(result.rawIouCount, 15);
  assert.equal(result.totalMovingBaseUnits, "35000000");
  assertSettlementInvariants(result);
});

test("handles a large deterministic group and nets every member exactly", () => {
  const largeMembers = Array.from({ length: 36 }, (_, index) =>
    member(`p${index.toString().padStart(2, "0")}`, `Person ${index}`),
  );
  const expenses = Array.from({ length: 72 }, (_, index) =>
    expense(
      `large-${index.toString().padStart(2, "0")}`,
      largeMembers[index % 12].id,
      "1000000",
    ),
  );
  const splits = expenses.flatMap((item, index) => [
    split(item.id, largeMembers[index % largeMembers.length].id, "250000"),
    split(item.id, largeMembers[(index + 5) % largeMembers.length].id, "250000"),
    split(item.id, largeMembers[(index + 11) % largeMembers.length].id, "250000"),
    split(item.id, largeMembers[(index + 17) % largeMembers.length].id, "250000"),
  ]);
  const result = mustCalculate({
    expenses,
    members: largeMembers,
    splits,
    tokenAddress: "usdc",
  });

  assert.equal(result.algorithm, "greedy");
  assert.equal(result.eligibleExpenseIds.length, 72);
  assert.equal(result.rawIouCount, 264);
  assert.equal(result.totalMovingBaseUnits, "48000000");
  assertSettlementInvariants(result);
});

test("validates split totals, tokens, malformed amounts, and joined members", () => {
  assert.equal(
    errorCode({
      expenses: [expense("e1", "a", "1000000")],
      members: members.slice(0, 2),
      splits: [split("e1", "b", "999999")],
      tokenAddress: "usdc",
    }),
    "invalid_split_total",
  );
  assert.equal(
    errorCode({
      expenses: [{ ...expense("e1", "a", "1000000"), tokenAddress: "other" }],
      members: members.slice(0, 2),
      splits: [split("e1", "b", "1000000")],
      tokenAddress: "usdc",
    }),
    "token_mismatch",
  );
  assert.equal(
    errorCode({
      expenses: [expense("e1", "a", "1.5")],
      members: members.slice(0, 2),
      splits: [split("e1", "b", "1000000")],
      tokenAddress: "usdc",
    }),
    "invalid_amount",
  );
  assert.equal(
    errorCode({
      expenses: [expense("e1", "a", "1000000")],
      members: [{ ...member("a", "Alex"), joinStatus: "invited" }, member("b", "Bela")],
      splits: [split("e1", "b", "1000000")],
      tokenAddress: "usdc",
    }),
    "invalid_member",
  );
});

test("uses exact optimization where greedy would use more transfers", () => {
  const result = mustCalculate({
    expenses: [
      expense("pa", "a", "4000000"),
      expense("pb", "b", "3000000"),
      expense("pc", "c", "2000000"),
    ],
    members,
    splits: [
      split("pa", "d", "3000000"),
      split("pa", "e", "1000000"),
      split("pb", "e", "2000000"),
      split("pb", "f", "1000000"),
      split("pc", "f", "2000000"),
    ],
    tokenAddress: "usdc",
  });

  assert.equal(result.algorithm, "exact-small-group");
  assert.equal(result.settlementCount, 4);
  assertSettlementInvariants(result);
});

test("falls back to greedy for larger groups and satisfies every balance", () => {
  const largeMembers = Array.from({ length: 20 }, (_, index) =>
    member(`m${index.toString().padStart(2, "0")}`, `Member ${index}`),
  );
  const expenses = largeMembers.slice(0, 10).map((payer, index) =>
    expense(`e${index}`, payer.id, "10000000"),
  );
  const splits = expenses.flatMap((item, index) => [
    split(item.id, largeMembers[10 + index].id, "7000000"),
    split(item.id, largeMembers[(11 + index) % 20].id, "3000000"),
  ]);
  const result = mustCalculate({
    exactThreshold: 8,
    expenses,
    members: largeMembers,
    splits,
    tokenAddress: "usdc",
  });

  assert.equal(result.algorithm, "greedy");
  assertSettlementInvariants(result);
});

test("keeps ordering stable across shuffled input arrays", () => {
  const input: SettlementEngineInput = {
    expenses: [expense("e2", "b", "3000000"), expense("e1", "a", "6000000")],
    members: [members[2], members[0], members[1]],
    splits: [
      split("e2", "c", "3000000"),
      split("e1", "a", "2000000"),
      split("e1", "b", "2000000"),
      split("e1", "c", "2000000"),
    ],
    tokenAddress: "usdc",
  };
  const shuffled: SettlementEngineInput = {
    ...input,
    expenses: [...input.expenses].reverse(),
    members: [...input.members].reverse(),
    splits: [...input.splits].reverse(),
  };

  assert.deepEqual(mustCalculate(input), mustCalculate(shuffled));
});

function mustCalculate(input: SettlementEngineInput) {
  const output = calculateSettlement(input);

  if (output.ok === false) {
    assert.fail(output.error.message);
  }

  return output.result;
}

function errorCode(input: SettlementEngineInput) {
  const output = calculateSettlement(input);

  if (output.ok === true) {
    assert.fail("Expected settlement calculation to fail.");
  }

  return output.error.code;
}

function assertBalances(result: SettlementEngineResult, expected: Record<string, string>) {
  assert.deepEqual(
    Object.fromEntries(
      result.balances.map((balance) => [balance.memberId, balance.netBaseUnits]),
    ),
    expected,
  );
}

function assertSettlementInvariants(result: SettlementEngineResult) {
  const zero = BigInt(0);
  const netByMember = new Map(
    result.balances.map((balance) => [balance.memberId, BigInt(balance.netBaseUnits)]),
  );
  const transferDeltas = new Map(result.balances.map((balance) => [balance.memberId, zero]));
  const positiveNetTotal = result.balances.reduce((sum, balance) => {
    const net = BigInt(balance.netBaseUnits);

    return net > zero ? sum + net : sum;
  }, zero);
  const netTotal = result.balances.reduce(
    (sum, balance) => sum + BigInt(balance.netBaseUnits),
    zero,
  );
  const transferTotal = result.transfers.reduce(
    (sum, transfer) => sum + BigInt(transfer.amountBaseUnits),
    zero,
  );

  assert.equal(netTotal, zero);
  assert.equal(result.rawIouCount, result.rawIous.length);
  assert.equal(result.settlementCount, result.transfers.length);
  assert.equal(BigInt(result.totalMovingBaseUnits), transferTotal);
  assert.equal(transferTotal, positiveNetTotal);

  for (const rawIou of result.rawIous) {
    assert.notEqual(rawIou.fromMemberId, rawIou.toMemberId);
    assert.ok(BigInt(rawIou.amountBaseUnits) > zero);
  }

  for (const transfer of result.transfers) {
    const amount = BigInt(transfer.amountBaseUnits);

    assert.ok(amount > zero);
    assert.ok(transferDeltas.has(transfer.fromMemberId));
    assert.ok(transferDeltas.has(transfer.toMemberId));
    transferDeltas.set(transfer.fromMemberId, transferDeltas.get(transfer.fromMemberId)! - amount);
    transferDeltas.set(transfer.toMemberId, transferDeltas.get(transfer.toMemberId)! + amount);
  }

  for (const [memberId, net] of netByMember) {
    assert.equal(transferDeltas.get(memberId), net);
  }
}

function transferTriples(result: SettlementEngineResult) {
  return result.transfers.map((transfer) => [
    transfer.fromMemberId,
    transfer.toMemberId,
    transfer.amountBaseUnits,
  ]);
}

function finalTabVector() {
  const tokenAddress = "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d";
  const includedExpenses = [
    dbExpense(
      "10000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
      "30000000",
      tokenAddress,
    ),
    dbExpense(
      "10000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000002",
      "12000000",
      tokenAddress,
    ),
  ];
  const excludedExpenses = [
    {
      ...dbExpense(
        "10000000-0000-4000-8000-000000000003",
        "00000000-0000-4000-8000-000000000003",
        "9000000",
        tokenAddress,
      ),
      status: "pending" as const,
    },
  ];
  const vectorMembers = [
    dbMember(
      "00000000-0000-4000-8000-000000000001",
      "Alex",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "owner",
    ),
    dbMember(
      "00000000-0000-4000-8000-000000000002",
      "Bela",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "member",
    ),
    dbMember(
      "00000000-0000-4000-8000-000000000003",
      "Cy",
      "0xcccccccccccccccccccccccccccccccccccccccc",
      "member",
    ),
  ];
  const vectorSplits = [
    dbSplit(includedExpenses[0].id, vectorMembers[0].id, "10000000"),
    dbSplit(includedExpenses[0].id, vectorMembers[1].id, "10000000"),
    dbSplit(includedExpenses[0].id, vectorMembers[2].id, "10000000"),
    dbSplit(includedExpenses[1].id, vectorMembers[0].id, "6000000"),
    dbSplit(includedExpenses[1].id, vectorMembers[1].id, "6000000"),
    dbSplit(excludedExpenses[0].id, vectorMembers[2].id, "9000000"),
  ];
  const settlement = mustCalculate({
    expenses: includedExpenses.map((item) => ({
      amountBaseUnits: item.amountBaseUnits.toString(),
      id: item.id,
      payerMemberId: item.payerMemberId,
      status: item.status,
      title: item.title,
      tokenAddress: item.tokenAddress,
    })),
    members: vectorMembers.map((item) => ({
      displayName: item.displayName,
      id: item.id,
      joinStatus: item.joinStatus,
      walletAddress: item.walletAddress,
    })),
    splits: vectorSplits.map((item) => ({
      expenseId: item.expenseId,
      memberId: item.memberId,
      shareBaseUnits: item.shareBaseUnits.toString(),
    })),
    tokenAddress,
  });
  const input = {
    chainId: 421614,
    coordinatorWalletAddress: vectorMembers[0].walletAddress!,
    excludedExpenses,
    expiresAt: new Date("2026-07-11T12:00:00.000Z"),
    includedExpenses,
    members: vectorMembers,
    proposalVersion: 1,
    settlement,
    settlementContractAddress: "0x2222222222222222222222222222222222222222",
    splits: vectorSplits,
    tabId: "11111111-1111-4111-8111-111111111111",
    tokenAddress,
  };

  return {
    finalTab: buildFinalTab(input),
    input,
  };
}

function member(id: string, displayName: string) {
  return {
    displayName,
    id,
    joinStatus: "joined" as const,
    walletAddress: null,
  };
}

function expense(id: string, payerMemberId: string, amountBaseUnits: string) {
  return {
    amountBaseUnits,
    id,
    payerMemberId,
    status: "confirmed" as const,
    title: id,
    tokenAddress: "usdc",
  };
}

function split(expenseId: string, memberId: string, shareBaseUnits: string) {
  return {
    expenseId,
    memberId,
    shareBaseUnits,
  };
}

function receiptAuthorization(input: {
  authorizationAmountBaseUnits: bigint | null;
  expiresAt?: Date;
  memberId: string;
  proposalHash: string;
  revokedAt?: Date | null;
}) {
  return {
    authorizationAmountBaseUnits: input.authorizationAmountBaseUnits,
    expiresAt: input.expiresAt ?? new Date("2026-07-10T13:00:00.000Z"),
    memberId: input.memberId,
    proposalHash: input.proposalHash,
    revokedAt: input.revokedAt ?? null,
  };
}

function receiptVerificationInput() {
  const chainId = 421614;
  const tokenAddress = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
  const settlementContractAddress = "0x2222222222222222222222222222222222222222";
  const proposalHash = "0xproposal";
  const tabKey = "0xtab";
  const transfersHash = "0xtransfers";
  const totalAmountBaseUnits = BigInt("12000000");

  return {
    expectedChainId: chainId,
    expectedSettlementContractAddress: settlementContractAddress,
    expectedTokenAddress: tokenAddress,
    proposal: {
      chainId,
      executedAt: new Date("2026-07-10T12:00:00.000Z"),
      proposalHash,
      settlementContractAddress,
      status: "executed",
      tabKey,
      tokenAddress,
      totalAmountBaseUnits,
      transfersHash,
    },
    tab: {
      networkChainId: chainId,
      status: "settled",
      tokenAddress,
    },
    transaction: {
      chainId,
      confirmedBlockNumber: BigInt(123),
      eventName: "FinalTabSettled",
      eventProposalHash: proposalHash,
      eventTabKey: tabKey,
      eventTotalAmountBaseUnits: totalAmountBaseUnits,
      eventTransferCount: 1,
      eventTransfersHash: transfersHash,
      settlementContractAddress,
      status: "confirmed",
      tokenAddress,
      txHash: "0xtx",
    },
    transferCount: 1,
  };
}

function dbMember(
  id: string,
  displayName: string,
  walletAddress: string,
  role: "owner" | "member",
) {
  return {
    createdAt: new Date("2026-07-10T12:00:00.000Z"),
    displayName,
    id,
    joinStatus: "joined" as const,
    readinessStatus: "not_ready" as const,
    role,
    tabId: "11111111-1111-4111-8111-111111111111",
    updatedAt: new Date("2026-07-10T12:00:00.000Z"),
    userId: null,
    walletAddress,
  };
}

function dbExpense(
  id: string,
  payerMemberId: string,
  amountBaseUnits: string,
  tokenAddress: string,
) {
  return {
    amountBaseUnits: BigInt(amountBaseUnits),
    createdAt: new Date("2026-07-10T12:00:00.000Z"),
    createdByUserId: "99999999-9999-4999-8999-999999999999",
    id,
    note: null,
    payerMemberId,
    splitMethod: "custom" as const,
    status: "confirmed" as const,
    tabId: "11111111-1111-4111-8111-111111111111",
    title: id,
    tokenAddress,
    updatedAt: new Date("2026-07-10T12:00:00.000Z"),
  };
}

function dbSplit(expenseId: string, memberId: string, shareBaseUnits: string) {
  return {
    createdAt: new Date("2026-07-10T12:00:00.000Z"),
    expenseId,
    id: `${expenseId}:${memberId}`,
    memberId,
    shareBaseUnits: BigInt(shareBaseUnits),
  };
}
