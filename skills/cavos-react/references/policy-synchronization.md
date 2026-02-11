# Policy Synchronization

This is the most critical part of the SDK to get right during integration.

## The Problem: Stale Policies
The session state is initialized once. If a user defines a spending policy **after** the session was created but **before** it was registered on-chain, the registration will use the *stale* (likely empty) policy.

## The Solution: `updateSessionPolicy`
Before triggering any on-chain registration, you must ensure the session in the SDK has the latest rules.

### Correct Implementation Pattern

```typescript
const handleActivate = async () => {
    // 1. Read latest local configuration
    const latestPolicy = getPolicyFromLocalState();

    // 2. Sync to SDK
    // This ensures the NEXT 'registerCurrentSession' call uses these rules
    updateSessionPolicy(latestPolicy);

    // 3. Register
    await registerCurrentSession();
};
```

## On-chain Enforcement
The `cavos.cairo` contract checks:
- `policy_count`: If 0, it skips all checks.
- `spending_limits`: Tracks used amounts per token for the session duration.
- `allowed_contracts`: Verifies the `to` address of every call.
