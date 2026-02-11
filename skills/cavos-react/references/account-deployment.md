# Account Deployment & Address Derivation

## How Addresses are Computed

Cavos uses **deterministic address derivation**. The wallet address is known before deployment.

### Inputs

| Input | Source | Example |
|-------|--------|---------|
| `sub` | OAuth JWT `sub` claim | `"110248495921238986213"` (Google) |
| `app_salt` | Fetched from Cavos backend per app | `"0x1a2b3c..."` |
| `walletName` | Optional user-defined name | `"Trading"`, `undefined` for default |
| `class_hash` | `OAuthWalletConfig.cavosAccountClassHash` | Network-specific |
| `jwks_registry` | `OAuthWalletConfig.jwksRegistryAddress` | Network-specific |

### Derivation

```
address_seed = Poseidon(sub_as_felt, app_salt)
// If walletName is provided:
address_seed = Poseidon(sub_as_felt, app_salt, walletName_as_felt)

constructor_calldata = [address_seed, jwks_registry]
address = compute_contract_address(class_hash, constructor_calldata)
```

This is handled by `AddressSeedManager.computeContractAddress()`.

## Deployment Flow

```
User calls deployAccount() or first execute()
    │
    ▼
OAuthTransactionManager.deployAccount()
    │
    ├─ 1. Create counterfactual Account with PaymasterRpc
    │     (address is known, but no contract exists yet)
    │
    ├─ 2. Build AccountDeploymentData
    │     { classHash, constructorCalldata, addressSalt }
    │
    ├─ 3. OAuthSigner.signDeployAccountTransaction()
    │     → buildJWTSignatureData() → OAUTH_JWT_V1 signature
    │     → Includes full JWT + RSA modulus + session policy
    │
    ├─ 4. Execute via AVNU Paymaster (gasless)
    │     → PaymasterRpc handles gas sponsoring
    │
    └─ 5. On-chain: __validate_deploy__
          → Verifies JWT signature (RSA)
          → Stores address_seed
          → Registers session key with policy
```

### Key Points

- **No relayer needed** — the account deploys itself via PaymasterRpc.
- **Session is registered during deployment** — no separate registration step needed.
- **Gasless** — AVNU sponsors the deployment gas.
- **Idempotent** — calling `deployAccount()` when already deployed is safe (returns early).

## Multi-Wallet (Sub-Accounts)

Users can create multiple wallets under the same identity using `walletName`:

```typescript
// Default wallet (unnamed)
const defaultAddress = getAddress(); // Uses sub + salt

// Named wallet
await switchWallet('Trading');
const tradingAddress = getAddress(); // Uses sub + salt + 'Trading'

// List all known wallets
const wallets = await getAssociatedWallets();
// → [{ address: '0x...', name: undefined }, { address: '0x...', name: 'Trading' }]
```

### How Names are Discovered

Currently, wallet names are stored in `localStorage` under `cavos_seen_wallets_${appId}_${sub}`. This means:
- ✅ Works within the same browser
- ❌ Not persistent across devices
- ❌ Lost if localStorage is cleared

The SDK also scans for `SessionRegistered` events on-chain as a fallback, but this can only find addresses, not names.
