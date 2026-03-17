# Transaction Execution

## Execution Paths

All transactions in Cavos go through the AVNU paymaster for gasless execution, but the **signature type** differs based on session state.

### Path 1: JWT Signature (`OAUTH_JWT_V1`)

Used as a **fallback** when the session is **not yet registered** on-chain. Normally, the session is auto-registered after `login()`, but if that background process hasn't completed yet, `execute()` transparently falls back to JWT signature to register + execute atomically.

**What's in the calldata (~900+ felts, varies with JWT size and policies):**
```
[0]      OAUTH_JWT_V1 magic (0x4f415554485f4a57545f5631)
[1]      r  (ECDSA r from session key)
[2]      s  (ECDSA s from session key)
[3]      session_pubkey
[4]      valid_until (u64 block number)
[5]      randomness
[6]      jwt_sub      — OAuth user ID from JWT payload
[7]      jwt_nonce    — Poseidon(session_key, valid_until, randomness)
[8]      jwt_exp      — expiration timestamp
[9]      jwt_kid      — key ID hash (links JWT to JWKS entry)
[10]     jwt_iss      — issuer hash (google/apple/firebase)
[11]     salt         — per-app salt for address derivation
[12]     wallet_name  — wallet name hash (0 for default wallet)
[13-24]  claim offsets (12 felts):
         sub_offset, sub_len, nonce_offset, nonce_len,
         kid_offset, kid_len, exp_offset, exp_len,
         iss_offset, iss_len, aud_offset, aud_len
[25]     864          — Garaga RSA calldata length (always 864)
[26-889] Garaga RSA-2048 calldata (864 felts):
         - RSA signature     (24 × u96 limbs, little-endian)
         - PKCS#1 SHA-256    (24 × u96 limbs — expected message)
         - 17 × 48 felts     — modular reduction witnesses
           (16 squarings + 1 final multiply, each as quotient + remainder)
[890]    jwt_bytes_len
[891+]   packed JWT bytes (header.payload, split into 31-byte felt252 chunks)
[...]    valid_after
[...]    allowed_contracts_root  (Merkle root; 0 = unrestricted)
[...]    max_calls_per_tx
[...]    spending_policies_count
[...]    ...policies (token, limit_low, limit_high triplets)
```

**How the SDK builds this (`buildJWTSignatureData()`):**
1. Extracts RSA signature from JWT (third base64url segment, decoded)
2. Converts RSA sig to 24 × u96 limbs (little-endian)
3. Fetches RSA modulus from on-chain JWKS registry (`fetchNFromRegistry(kid)`)
4. Runs `rsa2048Sha256CalldataBuilder()` — computes the 17 modular reduction witnesses off-chain
5. Packs JWT bytes (header.payload) as 31-byte felt252 chunks
6. Locates claim offsets (sub, nonce, kid, exp, iss, aud) within the JWT for on-chain verification
7. Assembles the full calldata array above

**On-chain**: The contract calls `is_valid_rsa2048_sha256_signature()` (Garaga RSA-2048), validates all JWT claims, binds the nonce to the session key, and registers the session + policy.

**Cost**: ~11.8M gas for Garaga RSA-2048 verification (the dominant cost).

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
