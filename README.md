# Taby

![Taby banner](public/images/banner.png)

Taby helps a group agree on one Final Tab, approve exact obligations, settle together, and keep a shared receipt.

## Local development

```bash
pnpm install
pnpm dev
```

The app requires its normal private runtime configuration for authentication, database access, and settlement operations. Do not commit credentials or test-account identifiers.

## Verification

- [Technical evidence](docs/technical-evidence.md) records deployment facts and the policy for adding verified live-run references.
- [Architecture](docs/architecture.md) describes the implemented account, agreement, settlement, and receipt boundaries.
- [Reproducible QA](docs/e2e-demo-qa.md) documents the development-only ETH Lisbon Team seed, preflight, and end-to-end checks.
- [Claims checklist](docs/claims-checklist.md) distinguishes verified implementation facts from unsupported or removed claims.

```bash
pnpm test:settlement
pnpm lint
pnpm build
```
