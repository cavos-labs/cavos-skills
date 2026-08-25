# Cavos Skills

AI-optimized knowledge for building on the [Cavos](https://cavos.xyz) ecosystem. Install these skills to give your AI coding assistant expert-level understanding of the Cavos SDKs.

## Install

```bash
npx skills add cavos-labs/cavos-skills
```

## What's Included

### 🛡️ Cavos React SDK (`skills/cavos-react`)

Complete knowledge base for `@cavos/react` — Starknet account abstraction via OAuth and session keys.

**References:**
| Document | Coverage |
|----------|----------|
| [Session Management](skills/cavos-react/references/session-management.md) | Lifecycle, state machine, storage, renewal |
| [Policy Synchronization](skills/cavos-react/references/policy-synchronization.md) | Critical sync rule, on-chain enforcement |
| [Account Deployment](skills/cavos-react/references/account-deployment.md) | Address derivation, gasless deploy, multi-wallet |
| [Transaction Execution](skills/cavos-react/references/transaction-execution.md) | JWT vs session signatures, SNIP-9, error codes |

**Code Examples:**
| Script | Pattern |
|--------|---------|
| [basic-usage.tsx](skills/cavos-react/scripts/basic-usage.tsx) | Login + Transfer |
| [session-with-policy.tsx](skills/cavos-react/scripts/session-with-policy.tsx) | Policy sync before activation |
| [multicall-swap.tsx](skills/cavos-react/scripts/multicall-swap.tsx) | Approve + Swap atomic |
| [multi-wallet.tsx](skills/cavos-react/scripts/multi-wallet.tsx) | Sub-account management |

## Contributing

Found a bug pattern your AI keeps hitting? Add it to the relevant reference doc and submit a PR.

---
Built with ⚡ by [Cavos Labs](https://cavos.xyz)
