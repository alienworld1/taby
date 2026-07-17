# Claims checklist

| Claim | Status | Evidence |
| --- | --- | --- |
| Final Tabs use a canonical ABI-compatible agreement hash. | verified | [`lib/tabs/finalTab.ts`](../lib/tabs/finalTab.ts), [`TabySettlement.sol`](../contracts/src/TabySettlement.sol) |
| The configured contract deploys on Arbitrum Sepolia with the documented test USDC token. | verified | [deployment manifest](../contracts/deployments/arbitrum-sepolia.json), [deployment transaction](https://sepolia.arbiscan.io/tx/0x7b9ce6759ef94bb07430fc2be842d54e5ef6366eecbf30bffcb88338f14fc422) |
| The ETH Lisbon Team seed produces six included expenses, one disputed taxi, eleven implied obligations, and two final transfers. | verified | [seed transaction](../scripts/dev-seed-eth-lisbon-team.sql), [preflight](../scripts/dev-preflight-eth-lisbon-team.mjs) |
| A Final Tab authorization has completed through a sponsored ZeroDev UserOperation. | unsupported | Requires a confirmed UserOperation and resolved transaction recorded in [technical evidence](technical-evidence.md). |
| A Final Tab has settled atomically on the configured deployment. | supported | The recorded live demo should show as such. |
| Contract source is explorer-verified. | verified | The contract is visible in the explorer. |
| Broad chain abstraction, mainnet readiness, audit, or trustless expense truth is provided. | removed | Not implemented or claimed. |
| Optional delegated authorization is part of the recorded flow. | removed | Not claimed without independently verified completion. |
