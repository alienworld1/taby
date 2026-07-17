# Reproducible QA

## Operator setup

Use a controlled database and four pre-created Magic users. Export their identifiers only in the operator terminal:

```bash
export TABY_DEMO_MIRA_MAGIC_USER_ID='...'
export TABY_DEMO_LEO_MAGIC_USER_ID='...'
export TABY_DEMO_CAMILA_MAGIC_USER_ID='...'
export TABY_DEMO_NOAH_MAGIC_USER_ID='...'
```

Set the normal private runtime configuration (`DATABASE_URL`, ZeroDev project/RPC and paymaster policy, and any selected account type). Do not commit these values.

Run configuration preflight before seeding:

```bash
npm run demo:preflight
```

Seed only after the configuration check passes. This command is development/operator-only and executes outside Next.js request handling:

```bash
psql "$DATABASE_URL" \
  -v magic_mira_user_id="$TABY_DEMO_MIRA_MAGIC_USER_ID" \
  -v magic_leo_user_id="$TABY_DEMO_LEO_MAGIC_USER_ID" \
  -v magic_camila_user_id="$TABY_DEMO_CAMILA_MAGIC_USER_ID" \
  -v magic_noah_user_id="$TABY_DEMO_NOAH_MAGIC_USER_ID" \
  -v zerodev_account_type="${ZERODEV_ACCOUNT_TYPE:-magic_eoa_7702}" \
  -f scripts/dev-seed-eth-lisbon-team.sql
```

The seed creates all ordinary tab, member, expense, split, and confirmation records in one transaction or rolls back. It refuses an existing ETH Lisbon Team tab. For a reset, use a fresh controlled database or a reviewed database restore; never delete a tab that has recorded settlement evidence.

Run the post-seed funding check before recording:

```bash
npm run demo:preflight -- --require-scenario
```

It checks the deployed contract’s token, four configured settlement accounts, seeded counts, and the current debtor balances plus a 1-USDC test buffer. It does not fund accounts or submit transactions.

## Happy path

1. Confirm the command reports six included expenses, one disputed Airport taxi, eleven implied obligations, and two final transfers.
2. Sign in as Mira through the normal product flow and open ETH Lisbon Team.
3. Verify Mira (India), Leo (Germany), Camila (Brazil), and Noah (United States), the seven expenses, and the taxi’s outside-settlement reason.
4. Review the normal graph or text summary. Lock the normal Final Tab only after its existing registration verification succeeds.
5. Sign in as each required debtor. In the normal authorization sheet, verify the exact amount, expiry, and Final Tab scope, then approve using the existing flow.
6. Refresh after authorization. Readiness must persist from the existing durable state.
7. Return as Mira and use the normal explicit settlement control only after authoritative readiness. Wait for verified confirmation.
8. Open the normal receipt. Confirm the proposal hash, settled transaction, excluded taxi, and completed transfers agree with the tab.
9. Record only confirmed references in [technical evidence](technical-evidence.md).

## Failure and recovery

1. In a controlled scenario, leave one debtor’s real settlement address underfunded.
2. Run the post-seed preflight and confirm it reports insufficient USDC before recording begins.
3. If testing the app’s safe failure path, use only the existing action and confirm the tab is not marked settled.
4. Fund the actual configured settlement address outside the product flow, refresh status, and continue. Do not submit a duplicate action.
5. Cancel a Magic confirmation as a non-money failure. Confirm no approval appears after refresh.

## Pending, responsive, and accessibility checks

1. During a real authorization or settlement confirmation, refresh once. The existing durable state must remain pending, confirming, or unknown—not return to a fresh money-moving action.
2. At 375px, check the tab, authorization sheet, readiness state, and receipt for no horizontal scroll or clipped actions.
3. Keyboard-navigate the primary controls; focus must remain visible and statuses must include text.
4. Enable reduced motion; no required state change may depend on animation.

## Backup receipt rehearsal

Use this only after a real confirmed receipt is documented in [technical evidence](technical-evidence.md). Confirm its receipt route, proposal hash, and Arbitrum transaction match the stored evidence. If live infrastructure is slow, state plainly that it is a prior confirmed receipt; never describe pending work as settled.
