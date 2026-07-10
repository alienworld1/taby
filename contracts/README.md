# Taby Contracts

Foundry workspace for the Taby settlement layer.

## Primary Contract

- `src/TabySettlement.sol` is the v2 onchain enforcement layer for a locked Final Tab.
- The contract records one active proposal per coordinator-scoped tab key, permanent cancellation, exact debtor authorizations, revocation, and settlement replay protection.
- Settlement recomputes the Final Tab hash and ordered transfer hash before moving Arbitrum Sepolia USDC with `transferFrom`.
- The old trusted proposal-authorizer signature path is not part of v2.

## Network

- Network: Arbitrum Sepolia
- Chain ID: `421614`
- USDC: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`

## Usage

### Build

```shell
forge build
```

### Test

```shell
forge test
```

### Format

```shell
forge fmt
```

### Deploy

```shell
source .env
forge script script/DeployTabySettlement.s.sol:DeployTabySettlement \
  --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

Required local environment variables:

- `PRIVATE_KEY`: funded Arbitrum Sepolia deployer key.
- `ARBITRUM_SEPOLIA_RPC_URL`: Arbitrum Sepolia RPC URL.

Do not commit private keys or RPC credentials.

### Verify Deployment

```shell
cast code <settlement-address> --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call <settlement-address> 'supportedToken()(address)' --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call <settlement-address> 'SUPPORTED_CHAIN_ID()(uint256)' --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
```

After deployment, update `deployments/arbitrum-sepolia.json` and `SETTLEMENT_CONTRACT_ADDRESS` with the deployed v2 address.
