# Technical evidence

This document records only evidence that can be checked in this repository or against the configured Arbitrum Sepolia deployment. It is an operator record, not product UI.

## Deployment

| Item | Verified reference |
| --- | --- |
| Network | Arbitrum Sepolia (`421614`) |
| Settlement contract | [`0x5FAfa9c09BC5d6b79fF0e3dBC0AaaB651eEB894C`](../contracts/deployments/arbitrum-sepolia.json) |
| Supported USDC | [`0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`](../contracts/deployments/arbitrum-sepolia.json) |
| Deployment transaction | [Arbiscan transaction](https://sepolia.arbiscan.io/tx/0x7b9ce6759ef94bb07430fc2be842d54e5ef6366eecbf30bffcb88338f14fc422) |
| Onchain token check | `npm run demo:preflight` reads `supportedToken()` from the configured deployment before it reports success. |

The deployment manifest is the source for the address, chain, compiler, constructor argument, and deployment transaction. Runtime configuration rejects a different contract address in [`lib/tabs/constants.ts`](../lib/tabs/constants.ts).

## Source verification

Contract source verification is currently unavailable: the deployment manifest records `not_attempted` and no explorer verification URL. No source-verified-contract claim is publishable until a verified URL for the configured address is recorded here.

## Account path and sponsorship

The active account path is selected by `ZERODEV_ACCOUNT_TYPE`: `magic_eoa_7702` by default, or `zerodev_kernel` only with the existing explicit fallback guard. The account configuration is defined in [`lib/account/zerodev/config.ts`](../lib/account/zerodev/config.ts).

`ZERODEV_PAYMASTER_POLICY_ID` is required by the preflight, and every prepared account must have the existing `available` paymaster-policy status. This proves configuration readiness, not a completed sponsored transaction. Do not claim a successful sponsored authorization until a confirmed `user_operation_records` entry and its resolved transaction are recorded below.

## Final Tab identity

Final Tab identity uses ABI-compatible deterministic encoding, including the application tab hash, coordinator-namespaced tab key, proposal version, chain, token, contract, expiry, expense hashes, ordered transfers, and total amount. The implementation is in [`lib/tabs/finalTab.ts`](../lib/tabs/finalTab.ts); the contract recomputes the same payload hash in [`TabySettlement.sol`](../contracts/src/TabySettlement.sol).

## Tested packages and contract checks

| Tool or package | Repository version/reference |
| --- | --- |
| Next.js | `16.2.10` in [`package.json`](../package.json) |
| React | `19.2.4` in [`package.json`](../package.json) |
| viem | `^2.55.0` in [`package.json`](../package.json) |
| ZeroDev SDK | `^5.5.10` in [`package.json`](../package.json) |
| Magic SDK | `^33.9.0` in [`package.json`](../package.json) |
| Solidity compiler | `0.8.33` in the [deployment manifest](../contracts/deployments/arbitrum-sepolia.json) |
| Deterministic settlement tests | `npm run test:settlement` — record its dated pass output only after running it in the target environment. |
| Solidity tests | `forge test` from `contracts/` — record its dated pass output only after running it in the target environment. |

## Live-run evidence status

No confirmed Final Tab authorization UserOperation, settlement transaction, or backup receipt is checked into this repository. The required evidence is deliberately omitted rather than represented with placeholders.

Before recording or publishing a live-run claim, add a dated row containing all of the following, verified against the active configuration:

| Required fact | Required proof |
| --- | --- |
| Authorization UserOperation hash and resolved transaction | Confirmed `user_operation_records` row, matching ZeroDev resolution, and Arbiscan transaction link. |
| Settlement transaction | Confirmed `settlement_transactions` row, matching `FinalTabSettled` event, and Arbiscan transaction link. |
| Backup receipt | Authorized receipt route, proposal hash, transaction hash, and verification time; each must match the stored receipt and event. |

The entry must use canonical 32-byte hashes and must not contain credentials, private RPC URLs, provider payloads, or funding keys. If any reference cannot be independently checked, its associated claim remains unsupported.

## Evidence-to-receipt cross-check

For a completed run, verify the same proposal hash in the normal receipt’s technical proof section, the persisted proposal, and the `FinalTabSettled` event. Verify the same transaction hash in the receipt, `settlement_transactions`, and Arbiscan. This is the approved recovery path when a live confirmation is delayed: show only a prior confirmed receipt whose exact references have been recorded above.

## Known limitations

- This is a testnet deployment; no mainnet-readiness, audit, or source-verification claim is made.
- Expense confirmation/dispute state is an application workflow. The contract commits and executes the locked Final Tab; it does not independently prove real-world expense truth.
- Optional delegated authorization is not evidence for this run unless the existing feature is both enabled and independently verified.
