# Session Management

## Session Key Lifecycle

### Phase 1: Generation (Login)
When `login()` is called:
1. `OAuthWalletManager.initializeSession(policy?)` generates a fresh ECDSA keypair.
2. The **public key** is hashed with the session parameters to produce a `nonce`.
3. This nonce is embedded in the OAuth redirect URL.
4. The OAuth provider (Google/Apple) includes the nonce in the signed JWT.
5. The JWT is returned to the app via callback, binding the session key to the user's identity.

### Phase 2: Storage
- **Session data** (private key, JWT, claims, address) → `sessionStorage` under key `cavos_oauth_session`.
- **Pre-auth data** (key pair before OAuth redirect) → `sessionStorage` under key `cavos_oauth_pre_auth`.
- `sessionStorage` is used intentionally: closing the tab clears the session for security.

### Phase 3: Registration (On-Chain)
Sessions can be registered in two ways:

| Method | When Used | Signature Type |
|--------|-----------|---------------|
| **Implicit** (first `execute()`) | Automatic | `OAUTH_JWT_V1` — full JWT + RSA verification on-chain |
| **Explicit** (`registerCurrentSession()`) | Manual pre-activation | `OAUTH_JWT_V1` — same as above |

After registration, subsequent transactions use `SESSION_V1` (lightweight ECDSA signature only).

### Phase 4: Active Use
Once registered, the session key signs transactions directly:
- Signature format: `[SESSION_V1_MAGIC, r, s, session_key, proofs...]`
- The contract validates: session is registered, not expired, not revoked, and spending limits are respected.

### Phase 5: Expiration & Renewal
- `valid_until`: Session expiry (default 24h after registration).
- `renewal_deadline`: Grace period end (default 48h after expiry).

**Within the grace window**, the OLD session key can authorize a NEW session key:
```
oldSessionKey.sign(newSessionKey, newValidUntil, newRenewalDeadline) → renewal tx
```

**After the grace window**, the user must re-login to get a new JWT.

### Phase 6: Revocation
- **Single revocation**: `revokeSession(pubKey)` — marks one key as invalid on-chain.
- **Emergency revocation**: `emergencyRevokeAllSessions()` — increments `revocation_epoch`, invalidating ALL sessions. The user can still re-login.

## Session State Machine

```
┌──────────┐    login()     ┌───────────┐    execute() or     ┌────────────┐
│  No       │───────────────→│  Created   │    register()       │ Registered │
│  Session  │               │  (local)   │───────────────────→│  (on-chain)│
└──────────┘               └───────────┘                     └──────┬─────┘
                                                                     │
                                                          valid_until expires
                                                                     │
                                ┌────────────┐                ┌──────▼─────┐
                                │  Dead       │◀── deadline ──│  Expired   │
                                │  (re-login) │   expires     │ (renewable)│
                                └────────────┘                └──────┬─────┘
                                                                     │
                                                              renewSession()
                                                                     │
                                                              ┌──────▼─────┐
                                                              │ Registered │
                                                              │  (new key) │
                                                              └────────────┘
```

## OAuthSession Interface

```typescript
interface OAuthSession {
  sessionPrivateKey: string;      // Hex-encoded ECDSA private key
  sessionPubKey: string;          // Hex-encoded public key
  nonceParams: NonceParams;       // { validUntil, renewalDeadline }
  nonce: string;                  // Hash(pubKey, params) — embedded in JWT
  jwt?: string;                   // Raw JWT string (base64url encoded)
  jwtClaims?: JWTClaims;          // Parsed claims { sub, nonce, exp, iss, aud }
  walletAddress?: string;         // Computed Starknet address
  addressSeed?: string;           // Poseidon hash used for deployment
  sessionPolicy?: SessionKeyPolicy; // Current spending rules
  walletName?: string;            // Sub-account name (optional)
}
```

## Storage Keys Reference

| Key | Storage Type | Contents |
|-----|-------------|----------|
| `cavos_oauth_session` | `sessionStorage` | Full `OAuthSession` JSON |
| `cavos_oauth_pre_auth` | `sessionStorage` | Pre-redirect key pair |
| `cavos_seen_wallets_${appId}_${sub}` | `localStorage` | Array of wallet names the user has created |
