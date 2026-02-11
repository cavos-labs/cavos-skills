---
name: cavos-react-sdk
description: "Guidelines for integrating and extending the Cavos React SDK for Starknet account abstraction via OAuth and Session Keys."
---

# Cavos React SDK (Specialized Knowledge)

This skill provides the architectural context and implementation rules for working with the `@cavos/react` SDK. Use these guidelines to ensure correct session handling, security enforcement, and on-chain synchronization.

## 1. Core Architecture
The SDK follows a 3-layer architecture for identity and transaction management:
- **OAuth Layer (`OAuthWalletManager`)**: Handles identity and salt derivation.
- **Session Layer (`SessionManager`)**: Manages ephemeral keys.
- **Transaction Layer (`OAuthTransactionManager`)**: Coordinates execution.

[Read more about Session Management](./references/session-management.md)

## 2. Security & Policy Enforcement
The contract enforces spending limits **only if they are registered on-chain**.

> [!IMPORTANT]
> **Synchronization Rule**: Before calling `registerCurrentSession()`, you **MUST** call `updateSessionPolicy(policy)`.

[Read more about Policy Synchronization](./references/policy-synchronization.md)

## 3. Implementation Examples
-   [Basic Usage: Login & Transfer](./scripts/basic-usage.tsx)

## 4. Troubleshooting
-   **Address Mismatch**: Ensure `sub` claim and `salt` are consistent.
-   **Session Expired**: Check `renewalDeadline` in session state.
-   **Spending Limit Error**: Verify token decimals in BigInt conversion.

---
For more details, see the [References](./references) directory.
