---
name: cavos-react-sdk
description: "Complete knowledge base for the Cavos React SDK — Starknet account abstraction via OAuth, session keys, and gasless transactions."
---

# Cavos React SDK — AI Agent Skill

> Complete architectural knowledge and implementation patterns for `@cavos/react`.
> This skill enables AI agents to correctly integrate, extend, and debug the Cavos SDK.

---

## 1. What is Cavos?

Cavos is a **non-custodial account abstraction SDK** for Starknet. It lets users create smart wallets using their existing OAuth identity (Google, Apple, or passwordless Magic Link) — no seed phrases, no browser extensions.

### Key Principles
- **Non-custodial**: The user's wallet is derived deterministically from their OAuth `sub` claim + a per-app salt. No one holds the keys.
- **Gasless by default**: All transactions go through the Cavos paymaster (SNIP-9 Outside Execution).
- **Session keys**: Ephemeral ECDSA keys that sign transactions on behalf of the user, with configurable spending limits and contract restrictions.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     React App                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │  <CavosProvider config={...}>                     │  │
│  │    useCavos() → { login, execute, address, ... }  │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│                    ┌─────┴─────┐                        │
│                    │ CavosSDK  │                        │
│                    └─────┬─────┘                        │
│          ┌───────────────┼───────────────┐              │
│   ┌──────┴───────┐ ┌────┴──────┐ ┌──────┴──────┐      │
│   │ OAuthWallet  │ │  Session  │ │ Transaction │      │
│   │   Manager    │ │  Manager  │ │   Manager   │      │
│   └──────────────┘ └───────────┘ └─────────────┘      │
│     Identity &        Key          Cavos Paymaster      │
│     JWT handling    lifecycle      & SNIP-9 execution   │
└─────────────────────────────────────────────────────────┘
                          │
                    ┌─────┴─────┐
                    │ Starknet  │
                    │ Contract  │
                    │ (Cairo)   │
                    └───────────┘
                    cavos.cairo
```

### Three Layers

| Layer | Class | Responsibility |
|-------|-------|---------------|
| **Identity** | `OAuthWalletManager` | OAuth login, JWT parsing, nonce computation, address derivation, session key generation, JWT signature building |
| **Session** | `SessionManager` | Session key storage, expiration tracking, renewal detection |
| **Execution** | `OAuthTransactionManager` | Account deployment, transaction execution (JWT vs session signature), session registration, renewal, revocation |

---

## 3. Configuration Reference

### `CavosConfig` (Required)

```typescript
interface CavosConfig {
  appId: string;                        // From https://cavos.xyz/dashboard
  backendUrl?: string;                  // Default: 'https://cavos.xyz'
  starknetRpcUrl?: string;             // Custom RPC (optional)
  network?: 'mainnet' | 'sepolia';     // Default: 'sepolia'
  paymasterApiKey?: string;            // Cavos Paymaster API Key (optional)
  enableLogging?: boolean;             // Debug logs (default: false)
  oauthWallet?: Partial<OAuthWalletConfig>;  // Advanced: custom class hash, registry
  session?: SessionConfig;             // Session duration & default policy
  slot?: SlotConfig;                   // Cartridge Slot (Katana) — enables executeOnSlot()
}
```

### `SlotConfig`

```typescript
interface SlotConfig {
  rpcUrl: string;    // RPC URL of your Cartridge Katana Slot instance
  chainId?: string;  // OPTIONAL — Exact internal VM chain ID (defaults to network)
  relayerAddress?: string;    // OPTIONAL — Funded account to pay for Slot deployment
  relayerPrivateKey?: string; // OPTIONAL — Private key for the relayer
}
```

> [!WARNING]
> **Internal Chain ID Requirement:** Katana nodes typically return `SN_MAIN` via RPC, but their Cairo VM uses a custom internal chain ID. Because the SDK signs the session registration against this internal ID, `slot.chainId` MUST be manually configured to the internal hex value of the Katana genesis. If omitted or incorrect, Katana will reject the outside execution with **"Invalid session key signature"**.

To find an unknown internal chain ID, deploy this minimal contract to Katana and call `get_chain_id` using `starkli`:
```cairo
#[starknet::interface]
pub trait ICheckChainId<TContractState> { fn get_chain_id(self: @TContractState) -> felt252; }
#[starknet::contract]
pub mod CheckChainId {
    use starknet::info::get_tx_info;
    #[storage] struct Storage {}
    #[abi(embed_v0)] impl Impl of super::ICheckChainId<ContractState> {
        fn get_chain_id(self: @ContractState) -> felt252 { get_tx_info().unbox().chain_id }
    }
}
```

> [!IMPORTANT]
> **Address Parity:** On modern Cavos Slots, the `CavosAccount` class and `JWKSRegistry` are deployed at the exact same addresses as production (Sepolia/Mainnet). The SDK now automatically uses these parity addresses. You no longer need to provide `classHash` or `jwksRegistryAddress` in the `SlotConfig`.

### `SessionConfig`

```typescript
interface SessionConfig {
  sessionDuration?: number;         // Seconds (default: 86400 = 24h)
  renewalGracePeriod?: number;      // Seconds (default: 172800 = 48h)
  defaultPolicy?: SessionKeyPolicy; // Applied to all sessions
}
```

### `SessionKeyPolicy` ⚠️ Critical Type

```typescript
interface SessionKeyPolicy {
  spendingLimits: Array<{
    token: string;    // Contract address of the ERC-20 token
    limit: bigint;    // Maximum amount (in wei, use BigInt!)
  }>;
  allowedContracts: string[];  // Only these contracts can be called
  maxCallsPerTx: number;       // Max calls per multicall
}
```

> [!CAUTION]
> `limit` MUST be a `bigint` (e.g., `BigInt(10 * 10**18)` for 10 tokens with 18 decimals).
> Using `number` will silently truncate large values.

---

## 4. Complete API Reference

### 4.1 `useCavos()` Hook (Primary Interface)

This is what 99% of integrations should use:

```typescript
const {
  // --- State ---
  isAuthenticated,          // boolean
  user,                     // UserInfo | null → { id, email, name, picture? }
  address,                  // string | null → '0x...' Starknet address
  hasActiveSession,         // boolean
  isLoading,                // boolean — true during init/login
  walletStatus,             // WalletStatus → { isDeploying, isDeployed, isRegistering, isSessionActive, isReady, pendingDeployTxHash? }
  sessionPublicKey,         // string | null — public key of current session key (safe to display)

  // --- Auth ---
  login,                    // (provider: 'google'|'apple') => Promise<void>
  sendMagicLink,            // (email: string) => Promise<void>  — passwordless; auth completes in background
  logout,                   // () => Promise<void>

  // --- Transactions ---
  execute,                  // (calls: Call | Call[], options?: { gasless?: boolean }) => Promise<string>
                            //   gasless: true (default) → Cavos Paymaster sponsors gas
                            //   gasless: false → wallet pays gas from its own STRK balance
  executeOnSlot,            // (calls: Call | Call[]) => Promise<string>
                            //   Routes to Cartridge Slot (Katana) — always fee-free, no paymaster
                            //   Requires slot config. First call deploys account + registers session on Slot.
  signMessage,              // (typedData: TypedData) => Promise<string[]>  (SNIP-12 → [SESSION_V1_magic, r, s, session_key])

  // --- Session Management ---
  registerCurrentSession,   // () => Promise<string>  → explicit on-chain registration
  updateSessionPolicy,      // (policy: SessionKeyPolicy) => void  → MUST call before register!
  renewSession,             // () => Promise<string>
  revokeSession,            // (sessionKey: string) => Promise<string>  — sessionKey is REQUIRED
  emergencyRevokeAllSessions, // () => Promise<string>  → nuclear option
  exportSession,            // () => string  → base64 token for CLI

  // --- Account ---
  isAccountDeployed,        // () => Promise<boolean>
  deployAccount,            // () => Promise<string>
  getBalance,               // () => Promise<string>  → ETH balance as string (wei)

  // --- Multi-Wallet ---
  getAssociatedWallets,     // () => Promise<{ address: string; name?: string }[]>
  switchWallet,             // (name?: string) => Promise<void>

  // --- Modal ---
  openModal,                // () => void  — open built-in auth modal
  closeModal,               // () => void  — close built-in auth modal

  // --- Utilities ---
  getOnramp,                // (provider: 'RAMP_NETWORK') => string  → fiat onramp URL

  // --- Raw SDK (Advanced) ---
  cavos,                    // CavosSDK instance for direct access
} = useCavos();
```

### 4.2 Login Providers

| Provider | Method | Notes |
|----------|--------|-------|
| `'google'` | `login('google')` | Opens new tab → Google OAuth. Address derived from Google `sub`. |
| `'apple'` | `login('apple')` | Opens new tab → Apple OAuth. Address derived from Apple `sub`. |
| Magic Link | `sendMagicLink(email)` | Passwordless. Email sent immediately; auth completes in background when user clicks link. |

### 4.3 WalletStatus

```typescript
interface WalletStatus {
  isDeploying: boolean;           // Account contract is being deployed
  isDeployed: boolean;            // Account contract is deployed on-chain
  isRegistering: boolean;         // Session key is being registered on-chain
  isSessionActive: boolean;       // Session key is registered and not expired
  isReady: boolean;               // Both deployed + session active — ready for transactions
  pendingDeployTxHash?: string;   // Set when deploy tx submitted but confirmation timed out
}
```

`pendingDeployTxHash` is useful to show an explorer link when deployment takes longer than expected (e.g., network congestion). The SDK persists this hash in localStorage and re-polls on next `init()`.

---

## 5. Critical Flows & Rules

### 5.1 The Policy Synchronization Rule

> [!IMPORTANT]
> **ALWAYS** call `updateSessionPolicy(policy)` BEFORE `registerCurrentSession()`.

**Why**: The session policy is captured at login time. If the user changes their spending limits in the UI after login but before registration, the stale (possibly empty) policy gets stored on-chain.

**What happens if you don't**: The contract sees `policy_count == 0` and **skips all spending limit checks**, allowing unlimited transfers.

```typescript
// ✅ CORRECT
const activate = async () => {
  updateSessionPolicy(latestPolicy);  // Sync first!
  await registerCurrentSession();     // Then register
};

// ❌ WRONG — stale policy gets registered
const activate = async () => {
  await registerCurrentSession();  // Uses policy from login time!
};
```

See: [Policy Synchronization Deep Dive](./references/policy-synchronization.md)

### 5.2 Transaction Execution Flow

```
execute(calls, { gasless? })   (gasless defaults to true)
    │
    ├─ Session NOT registered?
    │   ├─ gasless: true  → JWT signature (OAUTH_JWT_V1), auto-registers + executes atomically
    │   └─ gasless: false → THROWS — must register session first (via sponsored tx)
    │
    ├─ Session registered & active?
    │   ├─ gasless: true  → Cavos Paymaster (SNIP-9 Outside Execution)
    │   └─ gasless: false → Direct v3 INVOKE via raw RPC (wallet pays STRK)
    │                        • Custom fee estimation (dummy SESSION_V1 sig + 5M gas overhead for __validate__)
    │                        • Hash computed manually, submitted via starknet_addInvokeTransaction
    │                        • Bypasses starknet.js Account.execute() entirely
    │
    ├─ Session expired but within grace period?
    │   └─ Auto-renews session (always sponsored), then executes with chosen gasless option
    │
    └─ Session expired beyond grace period?
        └─ Throws "SESSION_EXPIRED" → user must re-login
```

### 5.3 Slot (Cartridge Katana) Execution

`executeOnSlot(calls)` routes transactions to a Cartridge Slot instance. Slot runs with `no_fee = true`, so no paymaster is needed.

**Flow:**
```
executeOnSlot(calls)
    │
    ├─ First call ever on Slot?
    │   1. Deploy account on Slot (mirror of mainnet account)
    │   2. Register session key via execute_from_outside_v2 (built-in Cavos relayer handles this)
    │   3. Execute the call with session key
    │
    └─ Session already registered on Slot?
        └─ Direct invoke with SESSION_V1 session key signature (no relayer, no paymaster)
```

**Config pattern:**
```tsx
<CavosProvider
  config={{
    appId: 'YOUR_APP_ID',
    network: 'mainnet',       // Slot is forked from mainnet
    paymasterApiKey: 'key',
    slot: {
      rpcUrl: 'https://api.cartridge.gg/x/your-project/katana',
      chainId: '0x57505f4341564f53', // 'WP_CAVOS' in hex
      relayerAddress: '0x...',       // Optional: custom relayer
      relayerPrivateKey: '0x...',
    },
    session: {
      defaultPolicy: {
        allowedContracts: [GAME_CONTRACT],  // Must include Slot contracts
        maxCallsPerTx: 10,
      },
    },
  }}
>
```

**Usage:**
```typescript
// All calls go to Slot — always fee-free
const txHash = await executeOnSlot({
  contractAddress: GAME_CONTRACT,
  entrypoint: 'make_move',
  calldata: ['42', '7'],
});
```

> [!TIP]
> **Relayer Setup:** While the SDK has default relayers, it is recommended to provide a `relayerAddress` and `relayerPrivateKey` for your specific Slot to ensure the account deployment (which is free on Slot anyway) always has a funded "payer" available.

### 5.4 Account Deployment

Accounts are deployed **automatically after login** — no manual steps needed.
- After `login()`, the SDK calls `deployAccountInBackground()` which:
  1. Deploys the account via Cavos Paymaster (gasless) if not already deployed
  2. Auto-registers the session key on-chain using JWT signature
  3. Updates `walletStatus.isReady = true` when both steps complete
- `walletStatus` transitions: `isDeploying → isDeployed → isRegistering → isSessionActive → isReady ✅`
- No relayer needed — fully self-custodial.

### 5.5 Address Derivation

The wallet address is **deterministic** and derived from:
```
address = Poseidon(sub, salt, walletName?)
```
- `sub`: OAuth subject claim (unique per user per provider)
- `salt`: Per-app salt fetched from the Cavos backend
- `walletName`: Optional name for sub-accounts (default: unnamed)

### 5.6 Session Renewal

Sessions have two time boundaries:
- `valid_until`: When the session expires (default: 24h after registration)
- `renewal_deadline`: Grace period window (default: 48h after expiry)

Between `valid_until` and `renewal_deadline`, the **old session key** can sign a renewal request for a **new session key**, without needing a new JWT.

### 5.7 Session Revocation

Two levels of revocation:
- `revokeSession(sessionKey: string)`: Invalidates one specific session key (the `sessionKey` parameter is **required** — pass `sessionPublicKey` to revoke the current one). Requires JWT.
- `emergencyRevokeAllSessions()`: Increments the on-chain `revocation_epoch`, invalidating ALL sessions. Nuclear option.

### 5.8 Magic Link Authentication

`sendMagicLink(email)` is a fire-and-forget method:
1. Sends a magic link email via the Cavos backend (returns immediately)
2. The SDK starts polling `localStorage` for `cavos_auth_result`
3. When the user clicks the link (in any tab / device), the auth tab writes the result to localStorage and closes
4. The SDK picks up the result via `storage` event or poll, calls `handleCallback()`, then fires `onAuthChange` listeners
5. React state (`isAuthenticated`, `address`, `walletStatus`) updates automatically

To react to magic link completion in UI, subscribe via `cavos.onAuthChange(cb)` or simply observe `isAuthenticated` changing.

### 5.9 Auth Modal (`CavosAuthModal`)

The SDK ships a fully managed auth modal. The recommended pattern is to pass `modal` to `CavosProvider` and call `openModal()`:

```tsx
// app/providers.tsx
<CavosProvider
  config={{ appId: 'YOUR_APP_ID', network: 'sepolia' }}
  modal={{
    appName: 'My App',
    theme: 'dark',
    providers: ['google', 'apple', 'email'],  // default: all three
    primaryColor: '#6366f1',
    onSuccess: (address) => console.log('Wallet ready:', address),
  }}
>
  {children}
</CavosProvider>

// Anywhere in your app:
const { openModal } = useCavos();
<button onClick={openModal}>Connect Wallet</button>
```

#### `CavosModalConfig` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `appName` | `string` | — | Shown in header: *"Sign in to {appName}"*. Omit for *"Log in or sign up"*. |
| `providers` | `('google'\|'apple'\|'email')[]` | all three | Which auth methods to show. |
| `primaryColor` | `string` | `'#0A0908'` | Magic link submit button color. |
| `theme` | `'light'\|'dark'` | `'light'` | Color scheme. |
| `onSuccess` | `(address: string) => void` | — | Fires ~1.6s after `walletStatus.isReady`. |

#### Modal Screens (internal — not controllable)

| Screen | Shown when |
|--------|-----------|
| `select` | Default — provider selection |
| `magic-link` | User typed an email and pressed Submit |
| `verify` | Magic link sent — waiting for click |
| `deploying` | User authenticated — wallet deploying |

**`deploying` screen cannot be dismissed** — clicking outside or the close button has no effect. This prevents navigating away before the wallet is ready.

On screens ≤640px, the modal renders as a **bottom sheet** instead of a centered dialog.

#### `useCavosAuth` convenience hook

Minimal hook for a connect button:

```tsx
import { useCavosAuth } from '@cavos/react';

const { openModal, closeModal, isAuthenticated, address, user, walletStatus, logout } = useCavosAuth();
```

#### Direct component usage (advanced)

```tsx
import { CavosAuthModal } from '@cavos/react';

<CavosAuthModal
  open={open}
  onClose={() => setOpen(false)}
  onSuccess={(address) => { setOpen(false); }}
  appName="My App"
  theme="dark"
  providers={['google', 'apple', 'email']}
  primaryColor="#6366f1"
/>
```

> `CavosAuthModal` **must** be inside a `<CavosProvider>` — it uses `useCavos()` internally.

---

## 5.10 DEPRECATED APIs — NEVER USE

The following APIs no longer exist in the SDK. Any code that references them will fail at runtime. **Do not generate code using these.**

| Removed API | Replacement |
|-------------|-------------|
| `login('firebase', email, password)` | `sendMagicLink(email)` |
| `register(email, password)` | removed — no registration needed |
| `resendVerificationEmail(email)` | removed |
| `EmailNotVerifiedError` | removed |
| `EmailVerificationRequiredError` | removed |
| `FirebaseCredentials` type | removed |
| `createWallet()` | automatic after `login()` |
| `deleteAccount()` | removed |
| `retryWalletUnlock()` | removed |
| `hasPasskeyOnlyWallet` | removed |
| `createSession({ allowedMethods, expiresAt })` | `registerCurrentSession()` + `updateSessionPolicy()` |
| `useSession()` hook | use `useCavos()` directly |
| `requiresWalletCreation` | removed — wallet auto-deploys |
| `WalletManager` / `TransactionManager` | `OAuthWalletManager` / `OAuthTransactionManager` |

---

## 6. Common Patterns

### Minimal Integration (5 lines)

```tsx
import { CavosProvider, useCavos } from '@cavos/react';

// In your layout:
<CavosProvider config={{ appId: 'YOUR_APP_ID', network: 'sepolia' }}>
  <App />
</CavosProvider>

// In your component:
function App() {
  const { login, execute, address, isAuthenticated } = useCavos();

  if (!isAuthenticated) return <button onClick={() => login('google')}>Login</button>;

  return <p>Wallet: {address}</p>;
}
```

### Execute a Token Transfer

```typescript
// Sponsored (default)
const tx = await execute({
  contractAddress: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d', // STRK
  entrypoint: 'transfer',
  calldata: [recipientAddress, amountLow, amountHigh] // uint256 = [low, high]
});

// User pays gas
const tx = await execute(
  { contractAddress: '0x04718...', entrypoint: 'transfer', calldata: [...] },
  { gasless: false }
);
```

### Multi-Call (Approve + Swap)

```typescript
const tx = await execute([
  {
    contractAddress: TOKEN_ADDRESS,
    entrypoint: 'approve',
    calldata: [ROUTER_ADDRESS, amountLow, amountHigh]
  },
  {
    contractAddress: ROUTER_ADDRESS,
    entrypoint: 'swap',
    calldata: [...]
  }
]);
```

### Export Session to CLI

```typescript
const token = exportSession();
// User runs: cavos session import <token>
```

---

## 7. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "Spending limit exceeded" | BigInt conversion error — wrong decimals | Verify `limit: BigInt(amount * 10**decimals)` |
| Transfer goes through despite limit | `policy_count == 0` on-chain | Call `updateSessionPolicy()` before `registerCurrentSession()` |
| "Address seed mismatch" | Different `sub` or `salt` between login and verification | Ensure `appSalt` is fetched correctly from backend |
| "SESSION_EXPIRED" | Session older than `valid_until` | Call `renewSession()` if within grace period, else re-login |
| `JwtExpiredError` thrown on `execute()` | OAuth JWT expired (typically after 1h) | Re-login via `login(provider)` |
| "Claim mismatch after decoding" | JWT kid rotation or issuer mismatch | Check JWKS registry is up to date |
| Account not deploying | No ETH/STRK for gas | Use paymaster (default) or fund the counterfactual address |
| `useCavos` throws "must be used within CavosProvider" | Component is outside the provider tree | Wrap your app in `<CavosProvider>` |
| "non-sponsored transaction without a registered session" | `gasless: false` called before any on-chain session | Execute one sponsored tx first, or call `registerCurrentSession()` |
| "Out of gas" in `__validate__` (user-pays path) | SKIP_VALIDATE estimation doesn't include validation gas | Already handled: SDK adds 5M L2-gas overhead automatically |
| "Resource bounds not satisfied" (user-pays path) | l1_gas.max_price_per_unit=0 in submitted tx | Already handled: SDK reads current l1_gas_price from estimateFee response |
| Magic link auth never completes | localStorage blocked (private browsing / iframe) | Ensure app is not in a sandboxed iframe; magic link requires localStorage access |
| `revokeSession()` throws "missing argument" | `sessionKey` parameter is required | Pass `sessionPublicKey` from `useCavos()`: `revokeSession(sessionPublicKey!)` |
| `pendingDeployTxHash` never clears | Deploy tx still unconfirmed | Link to explorer; SDK will re-poll on next page load |
| `executeOnSlot` throws "Slot not configured" | `slot` key missing from config | Add `slot: { rpcUrl: '...' }` to `CavosProvider` config |
| First Slot tx is slow | Deploys account + registers session on Slot (one-time) | Expected — subsequent calls are instant |
| "Invalid session key signature" on Slot | Old SDK with broken y-parity fix | Update `@cavos/react` to latest; SDK now normalizes session key y-coordinate |
| Slot tx rejected — "not in policy" | Game contract not in `allowedContracts` | Add Slot contract address to `session.defaultPolicy.allowedContracts` |
| Wrong chain ID on Slot or "Invalid session key signature" | Custom Katana uses internal chain ID different from RPC | Read the internal Katana chain ID via `get_tx_info().chain_id` and pass it explicitly in `slot.chainId` config |

---

## 8. Token Addresses (Starknet)

| Token | Mainnet | Sepolia |
|-------|---------|---------|
| ETH | `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7` | Same |
| STRK | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` | Same |
| USDC | `0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8` | — |
| USDT | `0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8` | — |

---

## 9. File Map (SDK Source)

When modifying the SDK, here's where things live:

| File | Purpose |
|------|---------|
| `src/CavosSDK.ts` | Main orchestrator — all public methods |
| `src/react/CavosContext.tsx` | React provider & `useCavos()` hook |
| `src/oauth/OAuthWalletManager.ts` | Identity, JWT, session keys, signatures |
| `src/oauth/OAuthTransactionManager.ts` | Deployment, execution, renewal, revocation |
| `src/oauth/AddressSeedManager.ts` | Deterministic address computation |
| `src/oauth/NonceManager.ts` | Session nonce for JWT binding |
| `src/types/config.ts` | `CavosConfig`, `SessionConfig`, `OAuthWalletConfig` |
| `src/types/session.ts` | `SessionKeyPolicy`, `SessionData` |
| `src/types/auth.ts` | `UserInfo`, `LoginProvider` |
| `src/paymaster/PaymasterIntegration.ts` | Cavos paymaster wrapper |
| `src/config/defaults.ts` | Network-specific defaults (class hashes, registry addresses, hardcoded Slot relayer) |

---

## 10. Coding Rules for AI Agents

1. **Never expose private keys** — use the managers, not raw crypto.
2. **Always sync policy before registration** — see Section 5.1.
3. **When adding SDK methods**: Expose in `CavosSDK.ts` → `CavosContext.tsx` → update `CavosContextValue` interface.
4. **uint256 in calldata** is always `[low, high]` — two felts.
5. **After SDK changes**: Run `npm run build` in `react/`, then copy `dist/` to consumer's `node_modules/@cavos/react/dist/`.
6. **Session storage** is `sessionStorage` (cleared on tab close) — this is intentional for security.
7. **Wallet names** are currently stored in `localStorage` (`cavos_seen_wallets_${appId}_${sub}`) — not persistent across devices.
8. **`revokeSession(sessionKey)`** — the `sessionKey` argument is **required**. Use `sessionPublicKey` from `useCavos()` to revoke the current session.
9. **`sendMagicLink`** is fire-and-forget. Auth completes via `onAuthChange` listeners, not via a returned Promise. Don't await auth state in the same call chain.
10. **`signMessage` returns `string[]`**, not a `{ r, s }` object. The array is `[SESSION_V1_magic, r, s, session_key]` — ready for on-chain `is_valid_signature`.
12. **`slot` config is optional** — if absent, `executeOnSlot()` throws. Never add `relayerAddress` or `relayerPrivateKey` to `SlotConfig` — they don't exist and the relayer is hardcoded in the SDK.
13. **Slot session key y-parity**: The SDK normalizes all session keys so y < p/2 (Stark field "positive" root), which is required by Cairo's `check_ecdsa_signature`. This fix is already applied to all three session key generation sites (`initializeSession`, `generateNewSession`, `freshenSession`) in `OAuthWalletManager.ts`. Do not bypass or skip this normalization.
11. **`pendingDeployTxHash`** in `WalletStatus` is set when a deploy tx was submitted but confirmation timed out. It persists in localStorage across page loads until the tx confirms.

---

For detailed reference documents, see the [references/](./references) directory.
For runnable code examples, see the [scripts/](./scripts) directory.
