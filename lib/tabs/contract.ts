import type { Address, Hex } from "viem";
import { encodeFunctionData, erc20Abi, keccak256, stringToBytes } from "viem";
import type { FinalTabPayload } from "./finalTab";

export const tabySettlementAbi = [
  {
    inputs: [{ internalType: "address", name: "supportedToken_", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "uint256", name: "schemaVersion", type: "uint256" },
          { internalType: "bytes32", name: "applicationTabIdHash", type: "bytes32" },
          { internalType: "bytes32", name: "tabKey", type: "bytes32" },
          { internalType: "address", name: "coordinator", type: "address" },
          { internalType: "uint256", name: "proposalVersion", type: "uint256" },
          { internalType: "uint256", name: "chainId", type: "uint256" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "address", name: "settlementContract", type: "address" },
          { internalType: "uint256", name: "expiresAt", type: "uint256" },
          { internalType: "bytes32", name: "includedExpensesHash", type: "bytes32" },
          { internalType: "bytes32", name: "excludedExpensesHash", type: "bytes32" },
          { internalType: "bytes32", name: "transfersHash", type: "bytes32" },
          { internalType: "uint256", name: "totalSettlementAmount", type: "uint256" },
        ],
        internalType: "struct TabySettlement.FinalTabPayload",
        name: "payload",
        type: "tuple",
      },
      { internalType: "bytes32", name: "proposalHash", type: "bytes32" },
    ],
    name: "registerFinalTab",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "tabKey", type: "bytes32" },
      { internalType: "bytes32", name: "proposalHash", type: "bytes32" },
    ],
    name: "cancelFinalTab",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "tabKey", type: "bytes32" },
      { internalType: "bytes32", name: "proposalHash", type: "bytes32" },
      { internalType: "uint256", name: "exactAmount", type: "uint256" },
      { internalType: "uint256", name: "expiresAt", type: "uint256" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
    ],
    name: "authorizeFinalTab",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "tabKey", type: "bytes32" },
      { internalType: "bytes32", name: "proposalHash", type: "bytes32" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
    ],
    name: "revokeFinalTab",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "uint256", name: "schemaVersion", type: "uint256" },
          { internalType: "bytes32", name: "applicationTabIdHash", type: "bytes32" },
          { internalType: "bytes32", name: "tabKey", type: "bytes32" },
          { internalType: "address", name: "coordinator", type: "address" },
          { internalType: "uint256", name: "proposalVersion", type: "uint256" },
          { internalType: "uint256", name: "chainId", type: "uint256" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "address", name: "settlementContract", type: "address" },
          { internalType: "uint256", name: "expiresAt", type: "uint256" },
          { internalType: "bytes32", name: "includedExpensesHash", type: "bytes32" },
          { internalType: "bytes32", name: "excludedExpensesHash", type: "bytes32" },
          { internalType: "bytes32", name: "transfersHash", type: "bytes32" },
          { internalType: "uint256", name: "totalSettlementAmount", type: "uint256" },
        ],
        internalType: "struct TabySettlement.FinalTabPayload",
        name: "payload",
        type: "tuple",
      },
      {
        components: [
          { internalType: "bytes32", name: "fromMemberIdHash", type: "bytes32" },
          { internalType: "bytes32", name: "toMemberIdHash", type: "bytes32" },
          { internalType: "address", name: "from", type: "address" },
          { internalType: "address", name: "to", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "orderIndex", type: "uint256" },
        ],
        internalType: "struct TabySettlement.SettlementTransfer[]",
        name: "transfers",
        type: "tuple[]",
      },
    ],
    name: "settleFinalTab",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "coordinator", type: "address" },
      { internalType: "bytes32", name: "applicationTabIdHash", type: "bytes32" },
    ],
    name: "deriveTabKey",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "tabKey", type: "bytes32" }],
    name: "getActiveFinalTab",
    outputs: [
      {
        components: [
          { internalType: "address", name: "coordinator", type: "address" },
          { internalType: "bytes32", name: "applicationTabIdHash", type: "bytes32" },
          { internalType: "bytes32", name: "proposalHash", type: "bytes32" },
          { internalType: "uint256", name: "expiresAt", type: "uint256" },
          { internalType: "uint256", name: "registeredAt", type: "uint256" },
          { internalType: "uint256", name: "totalSettlementAmount", type: "uint256" },
        ],
        internalType: "struct TabySettlement.ActiveFinalTab",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "proposalHash", type: "bytes32" },
      { internalType: "address", name: "debtor", type: "address" },
    ],
    name: "getAuthorization",
    outputs: [
      {
        components: [
          { internalType: "bytes32", name: "proposalHash", type: "bytes32" },
          { internalType: "address", name: "debtor", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "expiresAt", type: "uint256" },
          { internalType: "uint256", name: "nonce", type: "uint256" },
          { internalType: "bool", name: "revoked", type: "bool" },
          { internalType: "uint256", name: "authorizedAt", type: "uint256" },
        ],
        internalType: "struct TabySettlement.FinalTabAuthorization",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "cancelledProposalHashes",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "settledProposalHashes",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "supportedToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export type FinalTabContractPayload = {
  applicationTabIdHash: Hex;
  chainId: bigint;
  coordinator: Address;
  excludedExpensesHash: Hex;
  expiresAt: bigint;
  includedExpensesHash: Hex;
  proposalVersion: bigint;
  schemaVersion: bigint;
  settlementContract: Address;
  tabKey: Hex;
  token: Address;
  totalSettlementAmount: bigint;
  transfersHash: Hex;
};

export type SettlementContractTransfer = {
  amount: bigint;
  from: Address;
  fromMemberIdHash: Hex;
  orderIndex: bigint;
  to: Address;
  toMemberIdHash: Hex;
};

export function toFinalTabContractPayload(payload: FinalTabPayload): FinalTabContractPayload {
  return {
    applicationTabIdHash: payload.applicationTabIdHash,
    chainId: BigInt(payload.chainId),
    coordinator: payload.coordinatorWalletAddress,
    excludedExpensesHash: payload.excludedExpensesHash,
    expiresAt: BigInt(payload.expiresAt),
    includedExpensesHash: payload.includedExpensesHash,
    proposalVersion: BigInt(payload.proposalVersion),
    schemaVersion: BigInt(payload.schemaVersion),
    settlementContract: payload.settlementContractAddress,
    tabKey: payload.tabKey,
    token: payload.tokenAddress,
    totalSettlementAmount: BigInt(payload.totalSettlementAmountBaseUnits),
    transfersHash: payload.transfersHash,
  };
}

export function toSettlementContractTransfers(
  payload: FinalTabPayload,
): SettlementContractTransfer[] {
  return payload.transfers.map((transfer) => ({
    amount: BigInt(transfer.amountBaseUnits),
    from: transfer.fromWalletAddress,
    fromMemberIdHash: memberIdHash(transfer.fromMemberId),
    orderIndex: BigInt(transfer.orderIndex),
    to: transfer.toWalletAddress,
    toMemberIdHash: memberIdHash(transfer.toMemberId),
  }));
}

export type EncodedSettlementCall = {
  data: Hex;
  to: Address;
  value: bigint;
};

export function encodeRegisterFinalTabCall(input: {
  proposalHash: Hex;
  settlementContractAddress: Address;
  payload: FinalTabPayload;
}): EncodedSettlementCall {
  return {
    data: encodeFunctionData({
      abi: tabySettlementAbi,
      args: [toFinalTabContractPayload(input.payload), input.proposalHash],
      functionName: "registerFinalTab",
    }),
    to: input.settlementContractAddress,
    value: BigInt(0),
  };
}

export function encodeCancelFinalTabCall(input: {
  proposalHash: Hex;
  settlementContractAddress: Address;
  tabKey: Hex;
}): EncodedSettlementCall {
  return {
    data: encodeFunctionData({
      abi: tabySettlementAbi,
      args: [input.tabKey, input.proposalHash],
      functionName: "cancelFinalTab",
    }),
    to: input.settlementContractAddress,
    value: BigInt(0),
  };
}

export function encodeAuthorizeFinalTabBatch(input: {
  exactAmountBaseUnits: string;
  expiresAtUnixSeconds: string;
  nonce: string;
  proposalHash: Hex;
  settlementContractAddress: Address;
  tabKey: Hex;
  tokenAddress: Address;
}): EncodedSettlementCall[] {
  return [
    encodeTokenApprovalCall({
      amountBaseUnits: "0",
      spender: input.settlementContractAddress,
      tokenAddress: input.tokenAddress,
    }),
    encodeTokenApprovalCall({
      amountBaseUnits: input.exactAmountBaseUnits,
      spender: input.settlementContractAddress,
      tokenAddress: input.tokenAddress,
    }),
    {
      data: encodeFunctionData({
        abi: tabySettlementAbi,
        args: [
          input.tabKey,
          input.proposalHash,
          BigInt(input.exactAmountBaseUnits),
          BigInt(input.expiresAtUnixSeconds),
          BigInt(input.nonce),
        ],
        functionName: "authorizeFinalTab",
      }),
      to: input.settlementContractAddress,
      value: BigInt(0),
    },
  ];
}

export function encodeRevokeFinalTabBatch(input: {
  nonce: string;
  proposalHash: Hex;
  settlementContractAddress: Address;
  tabKey: Hex;
  tokenAddress: Address;
}): EncodedSettlementCall[] {
  return [
    encodeTokenApprovalCall({
      amountBaseUnits: "0",
      spender: input.settlementContractAddress,
      tokenAddress: input.tokenAddress,
    }),
    {
      data: encodeFunctionData({
        abi: tabySettlementAbi,
        args: [input.tabKey, input.proposalHash, BigInt(input.nonce)],
        functionName: "revokeFinalTab",
      }),
      to: input.settlementContractAddress,
      value: BigInt(0),
    },
  ];
}

function encodeTokenApprovalCall(input: {
  amountBaseUnits: string;
  spender: Address;
  tokenAddress: Address;
}): EncodedSettlementCall {
  return {
    data: encodeFunctionData({
      abi: erc20Abi,
      args: [input.spender, BigInt(input.amountBaseUnits)],
      functionName: "approve",
    }),
    to: input.tokenAddress,
    value: BigInt(0),
  };
}

function memberIdHash(memberId: string): Hex {
  return keccak256(stringToBytes(memberId));
}
