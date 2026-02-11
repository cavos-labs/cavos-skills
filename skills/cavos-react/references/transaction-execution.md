# Transaction Execution

## Execution Paths

All transactions in Cavos go through the AVNU paymaster for gasless execution, but the **signature type** differs based on session state.

### Path 1: JWT Signature (`OAUTH_JWT_V1`)

Used when the session is **not yet registered** on-chain (first transaction or explicit registration).

**What's in the signature:**
```
[
  OAUTH_JWT_V1 magic (0x4f415554485f4a57545f5631),
  r, s,                          // ECDSA signature from session key
  session_pubkey,
  valid_until, renewal_deadline,  // Session timestamps
  jwt_length, ...jwt_chunks,     // Raw JWT (base64url, split into 31-byte felts)
  rsa_modulus (16 u128 limbs),   // From JWKS
  montgomery_constants (32 values),
  claim_offsets (6 values),       // Where sub/nonce/kid are in the JWT
  allowed_contracts_count, ...contracts,
  max_calls_per_tx,
  spending_policies_count, ...policies
]
```

**On-chain**: The contract performs RSA verification of the JWT signature, validates claims, and registers the session key + policy.

**Cost**: Expensive (~2M gas) due to RSA verification.

### Path 2: Session Signature (`SESSION_V1`)

Used after the session is registered. Lightweight.

**What's in the signature:**
```
[
  SESSION_V1 magic (0x53455353494f4e5f5631),
  r, s,                          // ECDSA signature from session key
  session_pubkey,
  proof_len_1, ...merkle_proof_1, // One proof per call
  proof_len_2, ...merkle_proof_2
]
```

**On-chain**: The contract validates the ECDSA signature, checks the session isn't expired/revoked, verifies merkle proofs for contract access, and enforces spending limits.

**Cost**: Much cheaper (~200K gas).

## SNIP-9 Outside Execution

All paymaster transactions use the SNIP-9 "execute from outside" pattern:

1. SDK builds the calls.
2. Sends to AVNU API: `POST /paymaster/v1/execute`.
3. AVNU wraps the calls in an `execute_from_outside_v2` envelope.
4. Returns typed data for the session key to sign.
5. SDK signs with session key.
6. AVNU submits the transaction on-chain and pays the gas.

The contract entry point is:
```cairo
fn execute_from_outside_v2(
    outside_execution: OutsideExecution,
    signature: Array<felt252>
)
```

This calls `validate_outside_execution_signature_with_policy`, which:
- Validates the signature (JWT or session)
- Enforces spending limits
- Enforces allowed contracts
- Enforces max calls per tx

## Error Handling

| Error | Code | Meaning |
|-------|------|---------|
| `SESSION_EXPIRED` | Contract revert | Session's `valid_until` has passed |
| `SESSION_REVOKED` | Contract revert | Session key was explicitly revoked |
| `INVALID_SESSION` | Contract revert | Session key not registered |
| `Spending limit exceeded` | Contract revert | Transaction amount > remaining limit |
| `Contract not allowed` | Contract revert | Target contract not in `allowedContracts` |
| `Max calls exceeded` | Contract revert | More calls than `maxCallsPerTx` |
| `AVNU 400/500` | HTTP error | Paymaster rejected the transaction |

## Code Example: Execute with Error Handling

```typescript
import { useCavos } from '@cavos/react';

function TransferButton() {
  const { execute, renewSession } = useCavos();

  const handleTransfer = async () => {
    try {
      const txHash = await execute({
        contractAddress: STRK_ADDRESS,
        entrypoint: 'transfer',
        calldata: [recipient, amountLow, amountHigh]
      });
      console.log('Success:', txHash);
    } catch (error: any) {
      if (error.message?.includes('SESSION_EXPIRED')) {
        // Try to renew
        try {
          await renewSession();
          // Retry the transaction
          await execute(/* same calls */);
        } catch {
          // Grace period expired — user must re-login
          alert('Session expired. Please login again.');
        }
      } else if (error.message?.includes('Spending limit exceeded')) {
        alert('This transaction exceeds your spending limit.');
      } else {
        console.error('Transaction failed:', error);
      }
    }
  };
}
```
