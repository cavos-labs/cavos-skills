# Session Management in Cavos React SDK

The SDK handles ephemeral session keys to enable a seamless, non-custodial user experience on Starknet.

## Lifecycle

### 1. Generation
When `login()` is called, the `OAuthWalletManager` checks for an existing session in `sessionStorage`. If none exists:
- A new ECDSA session key is generated.
- The session is stored with a `valid_until` timestamp based on `sessionDuration` (default 24h).

### 2. JWT Binding
The session key is cryptographically bound to the user's identity via a JWT signature. This signature is what allows the Starknet account contract to verify that the session key was indeed authorized by the owner of the OAuth identity (`sub`).

### 3. Registration
Sessions can be registered on-chain in two ways:
- **Implicitly**: In the very first `execute()` call, the SDK bundles the session registration (using the JWT signature) and the actual business call into a single atomic transaction.
- **Explicitly**: By calling `registerCurrentSession()`. This is useful for "activating" the wallet before any interaction.

## Storage
Sessions are stored in `sessionStorage` under the key `cavos_session`. This ensures that refresh or navigation within the same tab preserves the session, but closing the tab (or window) clears it for security.
