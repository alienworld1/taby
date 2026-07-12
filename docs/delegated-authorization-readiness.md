# Delegated authorization readiness evidence

The delegated authorization feature remains disabled until every required row is marked `passed` with a dated evidence reference. A blocked row is not a pass.

| Area | Required evidence | Environment | Status |
| --- | --- | --- | --- |
| Baseline lint and TypeScript checks | `pnpm lint` and `pnpm exec tsc --noEmit` | local/CI | passed (2026-07-12) |
| Settlement logic | `pnpm test:settlement` | local/CI | passed (2026-07-12) |
| Settlement contract | `forge test --root contracts` | local/CI | passed (2026-07-12) |
| Direct authorization | Two Magic users complete authorization | Arbitrum Sepolia | blocked |
| Direct settlement | Two independently verified settlements and receipts | Arbitrum Sepolia | blocked |
| Permission compatibility | Pinned permissions SDK can install and reconstruct the EIP-7702 permission | local fork + testnet | blocked |
| Remote custody | Create/get/delete opaque remote signer reference; no key material leaves provider | test environment | blocked |
| Paymaster restriction | Exact permission execution without configured paymaster is rejected | local fork + testnet | blocked |
| One-use restriction | Second exact execution is rejected by the actual policy | local fork + testnet | blocked |
| Call-policy negatives | Every altered target, selector, argument, value, and extra call is rejected | local fork + testnet | blocked |
| Recovery | Unknown receipt, cancellation, race, stale Final Tab, and DB repair stay fail-closed | local fork + testnet | blocked |

Record the exact `@zerodev/permissions`, SDK, Kernel, EntryPoint, account mode, deployment address, sponsor policy identifier, test transaction hashes, and test date in the evidence record. Do not record credentials, serialized permissions containing secrets, DID tokens, or raw provider responses.

## Enablement

Set `TABY_DELEGATED_AUTHORIZATION_ENABLED=true` only after all rows pass and the following server-only values describe the tested configuration:

- `TABY_DELEGATED_AUTHORIZATION_START_GATE_EVIDENCE=verified`
- `TABY_DELEGATED_AUTHORIZATION_PERMISSION_PACKAGE_VERSION`
- `TABY_DELEGATED_AUTHORIZATION_CUSTODY_MODE=remote_signer`
- `TABY_DELEGATED_AUTHORIZATION_REMOTE_SIGNER_READY=true`
- `TABY_DELEGATED_AUTHORIZATION_PAYMASTER_PROVEN=true`
- `TABY_DELEGATED_AUTHORIZATION_CONFIG_HASH`
- `TABY_DELEGATED_AUTHORIZATION_KERNEL_VERSION`
- `TABY_DELEGATED_AUTHORIZATION_ENTRY_POINT_VERSION`
- `ZERODEV_REMOTE_SIGNER_URL` and `ZERODEV_REMOTE_SIGNER_API_KEY`
