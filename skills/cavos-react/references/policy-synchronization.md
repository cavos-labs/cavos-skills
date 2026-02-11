# Policy Synchronization

## The Problem

The session policy (spending limits, allowed contracts) is captured at **login time** when `initializeSession()` is called. It gets baked into the `OAuthSession` object.

If the user changes their policy in the UI after login but before on-chain registration, the registration still uses the **old policy** from the session.

### What Happens On-Chain

In `cavos.cairo`, the `enforce_spending_limits` function:

```cairo
let policy_count = self.session_spending_policy_count.read(session_key);
if policy_count == 0 {
    return; // ← SILENTLY SKIPS ALL CHECKS
}
```

If the registered policy had zero spending limits (because the policy was empty at initialization time), this function returns immediately. **Every transaction is allowed**, regardless of amount.

## The Fix: `updateSessionPolicy()`

The SDK exposes `updateSessionPolicy(policy)` on both `CavosSDK` and `useCavos()`.

This method:
1. Takes the latest `SessionKeyPolicy`.
2. Updates `this.session.sessionPolicy` in `OAuthWalletManager`.
3. Ensures the **next** `registerCurrentSession()` or `execute()` (first-time) uses this policy.

### Correct Pattern

```typescript
const { updateSessionPolicy, registerCurrentSession } = useCavos();

const handleActivate = async () => {
  // 1. Get latest policy from your UI state / localStorage / API
  const policy: SessionKeyPolicy = {
    allowedContracts: [STRK_ADDRESS],
    maxCallsPerTx: 3,
    spendingLimits: [{
      token: STRK_ADDRESS,
      limit: BigInt(10 * 10**18) // 10 STRK
    }]
  };

  // 2. Sync to SDK (updates in-memory session)
  updateSessionPolicy(policy);

  // 3. Register on-chain (now uses the synced policy)
  const txHash = await registerCurrentSession();
};
```

### Incorrect Pattern

```typescript
// ❌ WRONG — policy from login time is used
const handleActivate = async () => {
  // User changed their policy in the UI after login,
  // but we don't sync it before registering
  await registerCurrentSession(); // Registers with OLD/EMPTY policy!
};
```

## How the Policy is Encoded On-Chain

The policy is serialized into the JWT signature data (`buildJWTSignatureData`) as:

```
[
  allowed_contracts_count,
  ...allowed_contract_addresses,
  max_calls_per_tx,
  spending_policies_count,
  ...for each policy: [token_address, limit_low_128, limit_high_128]
]
```

The `limit` is split into two 128-bit halves (low and high) for Starknet's u256 representation.

## Verification Checklist

When implementing policy-related features, verify:

- [ ] `updateSessionPolicy()` is called **before** `registerCurrentSession()`
- [ ] `spendingLimits[].limit` uses `bigint`, not `number`
- [ ] Token decimals are correct (ETH/STRK = 18 decimals, USDC = 6 decimals)
- [ ] `allowedContracts` includes ALL contracts the session will interact with
- [ ] `maxCallsPerTx` accounts for multicall scenarios (approve + swap = 2 calls)
