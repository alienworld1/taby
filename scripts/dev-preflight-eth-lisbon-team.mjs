#!/usr/bin/env node

import { createHash } from "node:crypto";
import postgres from "postgres";
import { createPublicClient, erc20Abi, http, isAddress } from "viem";
import { arbitrumSepolia } from "viem/chains";
import deployment from "../contracts/deployments/arbitrum-sepolia.json" with { type: "json" };

const CHAIN_ID = 421614;
const TOKEN_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
const TEST_BUFFER_BASE_UNITS = 1000000n; // 1 USDC, documented operator buffer.
const REQUIRED_ROLES = ["mira", "leo", "camila", "noah"];
const requireScenario = process.argv.includes("--require-scenario");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("Demo setup is missing one of the four prepared member accounts.");
  }
  return value;
}

function getAccountConfig() {
  const accountType = process.env.ZERODEV_ACCOUNT_TYPE === "zerodev_kernel"
    ? "zerodev_kernel"
    : "magic_eoa_7702";
  const paymasterPolicy = process.env.ZERODEV_PAYMASTER_POLICY_ID ?? null;
  const projectIdentity = process.env.ZERODEV_PROJECT_ID ?? process.env.ZERODEV_RPC_URL ?? "missing";
  const zeroDevProjectIdHash = sha256(projectIdentity);
  const settlementContractAddress = deployment.address.toLowerCase();
  const configHash = sha256(JSON.stringify({
    accountType,
    chainId: CHAIN_ID,
    entryPointVersion: "0.7",
    kernelVersion: "0.3.3",
    paymasterPolicy,
    settlementContractAddress,
    tokenAddress: TOKEN_ADDRESS.toLowerCase(),
    zeroDevProjectIdHash,
  }));

  return { accountType, configHash, paymasterPolicy, settlementContractAddress };
}

async function main() {
  const memberIds = Object.fromEntries(
    REQUIRED_ROLES.map((role) => [role, requiredEnvironment(`TABY_DEMO_${role.toUpperCase()}_MAGIC_USER_ID`)]),
  );
  if (new Set(Object.values(memberIds)).size !== REQUIRED_ROLES.length) {
    throw new Error("Demo setup is missing one of the four prepared member accounts.");
  }

  const config = getAccountConfig();
  const configuredContract = process.env.SETTLEMENT_CONTRACT_ADDRESS?.toLowerCase();
  if (
    deployment.chainId !== CHAIN_ID ||
    deployment.contractName !== "TabySettlement" ||
    deployment.contractVersion !== "v2" ||
    deployment.supportedToken.toLowerCase() !== TOKEN_ADDRESS.toLowerCase() ||
    (configuredContract && configuredContract !== config.settlementContractAddress)
  ) {
    throw new Error("Demo configuration does not match the deployed Arbitrum Sepolia settlement contract.");
  }
  if (!process.env.ZERODEV_PROJECT_ID && !process.env.ZERODEV_RPC_URL) {
    throw new Error("Demo configuration does not match the deployed Arbitrum Sepolia settlement contract.");
  }
  if (!config.paymasterPolicy) {
    throw new Error("Demo configuration does not match the deployed Arbitrum Sepolia settlement contract.");
  }

  const rpcUrl = process.env.ZERODEV_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
  const client = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });
  const [chainId, supportedToken] = await Promise.all([
    client.getChainId(),
    client.readContract({ address: deployment.address, abi: [{ type: "function", name: "supportedToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "supportedToken" }),
  ]);
  if (chainId !== CHAIN_ID || supportedToken.toLowerCase() !== TOKEN_ADDRESS.toLowerCase()) {
    throw new Error("Demo configuration does not match the deployed Arbitrum Sepolia settlement contract.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Database configuration is required for the ETH Lisbon Team preflight.");
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const configuredMagicIds = Object.values(memberIds);
    const accounts = await sql`
      SELECT u.magic_user_id, usa.settlement_address, usa.paymaster_policy_status, usa.delegation_status
      FROM public.users u
      JOIN public.user_settlement_accounts usa ON usa.user_id = u.id
      WHERE u.magic_user_id IN ${sql(configuredMagicIds)}
        AND usa.chain_id = ${CHAIN_ID}
        AND usa.account_type = ${config.accountType}
        AND usa.config_hash = ${config.configHash}
    `;
    if (accounts.length !== REQUIRED_ROLES.length || accounts.some((account) => account.paymaster_policy_status !== "available" || account.delegation_status !== "ready" || !isAddress(account.settlement_address))) {
      throw new Error("A prepared member does not have a ready settlement account for this run.");
    }

    const scenarioRows = await sql`
      WITH scenario AS (
        SELECT id FROM public.tabs WHERE title = 'ETH Lisbon Team'
      ), balances AS (
        SELECT m.user_id,
          COALESCE((SELECT sum(e.amount_base_units) FROM public.expenses e WHERE e.tab_id = m.tab_id AND e.status = 'confirmed' AND e.payer_member_id = m.id), 0)
          - COALESCE((SELECT sum(es.share_base_units) FROM public.expense_splits es JOIN public.expenses e ON e.id = es.expense_id WHERE e.tab_id = m.tab_id AND e.status = 'confirmed' AND es.member_id = m.id), 0) AS net
        FROM public.tab_members m JOIN scenario s ON s.id = m.tab_id
      )
      SELECT
        (SELECT count(*) FROM scenario) AS tab_count,
        (SELECT count(*) FROM public.expenses e JOIN scenario s ON s.id = e.tab_id WHERE e.status = 'confirmed') AS included_count,
        (SELECT count(*) FROM public.expenses e JOIN scenario s ON s.id = e.tab_id WHERE e.status = 'disputed' AND e.title = 'Airport taxi' AND COALESCE(e.note, '') ILIKE '%outside settlement%') AS disputed_taxi_count,
        (SELECT count(*) FROM public.expense_splits es JOIN public.expenses e ON e.id = es.expense_id JOIN scenario s ON s.id = e.tab_id WHERE e.status = 'confirmed' AND es.member_id <> e.payer_member_id) AS implied_obligation_count,
        (SELECT count(*) FROM balances WHERE net < 0) AS final_transfer_count
    `;
    const scenario = scenarioRows[0];
    if (Number(scenario.tab_count) === 0) {
      if (requireScenario) {
        throw new Error("No eligible ETH Lisbon Team tab is present. Run the development-only seed command first.");
      }
      console.log("Configuration verified. No ETH Lisbon Team scenario exists yet; funding obligations will be checked after seeding.");
      return;
    }
    if (Number(scenario.tab_count) !== 1 || Number(scenario.included_count) !== 6 || Number(scenario.disputed_taxi_count) !== 1 || Number(scenario.implied_obligation_count) !== 11 || Number(scenario.final_transfer_count) !== 2) {
      throw new Error("The ETH Lisbon scenario no longer has the required agreed and disputed expense state.");
    }

    const debts = await sql`
      WITH scenario AS (SELECT id FROM public.tabs WHERE title = 'ETH Lisbon Team'), balances AS (
        SELECT m.user_id,
          COALESCE((SELECT sum(e.amount_base_units) FROM public.expenses e WHERE e.tab_id = m.tab_id AND e.status = 'confirmed' AND e.payer_member_id = m.id), 0)
          - COALESCE((SELECT sum(es.share_base_units) FROM public.expense_splits es JOIN public.expenses e ON e.id = es.expense_id WHERE e.tab_id = m.tab_id AND e.status = 'confirmed' AND es.member_id = m.id), 0) AS net
        FROM public.tab_members m JOIN scenario s ON s.id = m.tab_id
      )
      SELECT u.magic_user_id, (-balances.net)::text AS required_amount
      FROM balances JOIN public.users u ON u.id = balances.user_id
      WHERE balances.net < 0
    `;
    const accountByMagicId = new Map(accounts.map((account) => [account.magic_user_id, account]));
    for (const debt of debts) {
      const account = accountByMagicId.get(debt.magic_user_id);
      const balance = await client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [account.settlement_address] });
      const required = BigInt(debt.required_amount) + TEST_BUFFER_BASE_UNITS;
      if (balance < required) {
        throw new Error("One or more prepared accounts need USDC before the Final Tab can settle.");
      }
    }
    console.log("ETH Lisbon Team preflight passed: Arbitrum Sepolia, deployment token, prepared accounts, scenario counts, and debtor USDC buffer are verified.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : "ETH Lisbon Team preflight failed."));
