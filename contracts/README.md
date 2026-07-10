# Taby Contracts

Foundry workspace for the Taby settlement layer.

## Primary Contract

- `src/TabySettlement.sol` settles locked Taby proposals by moving Arbitrum Sepolia USDC with `transferFrom`.
- The contract verifies a trusted proposal-authorizer signature over the exact settlement call before using debtor allowances.
- The MVP deployment is recorded in `deployments/arbitrum-sepolia.json`.

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
- `PROPOSAL_AUTHORIZER_ADDRESS`: trusted signer address for exact proposal authorization.

Do not commit private keys or signer secrets.

### Verify Deployment

```shell
cast code <settlement-address> --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call <settlement-address> 'supportedToken()(address)' --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
cast call <settlement-address> 'proposalAuthorizer()(address)' --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL"
```
