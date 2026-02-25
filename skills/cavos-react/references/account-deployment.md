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

After `login()`, the SDK automatically triggers deployment in the background:

```
login() → handleCallback() → deployAccountInBackground()
    │
    ▼
CavosSDK.deployAccountInBackground()
    │
    ├─ 1. Check if already deployed (getClassHashAt)
    │     If yes → skip to session check
    │
    ├─ 2. Deploy via OAuthTransactionManager.deployAccount()
    │     → Create counterfactual Account with PaymasterRpc
    │     → Build AccountDeploymentData
    │     → OAuthSigner.signDeployAccountTransaction()
    │       → buildJWTSignatureData() → OAUTH_JWT_V1 signature
    │     → Execute via AVNU Paymaster (gasless)
    │     → On-chain: __validate_deploy__ verifies JWT + stores address_seed
    │
    └─ 3. Auto-register session via autoRegisterSession()
          → registerCurrentSession() with JWT signature
          → walletStatus.isReady = true ✅
```

### Key Points

- **Fully automatic** — no manual `deployAccount()` or `registerCurrentSession()` calls needed.
- **No relayer needed** — the account deploys itself via PaymasterRpc.
- **Session is auto-registered after deployment** — `walletStatus.isReady` only becomes `true` when both deploy + registration succeed.
- **Gasless** — AVNU sponsors the deployment gas.
- **Idempotent** — calling `deployAccount()` when already deployed is safe (returns early).
- **JWT fallback** — if auto-registration hasn't completed, `execute()` falls back to JWT signature.

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
