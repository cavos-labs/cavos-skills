# Cavos Skills

This repository contains **Specialized AI Agent Skills** for the Cavos ecosystem. These skills are designed to be consumed by AI coding assistants (like Claude Code, Antigravity, or Cursor) to help them understand and integrate Cavos SDKs flawlessly.

## Available Skills

-   **[Cavos React SDK](skills/cavos-react/SKILL.md)**: Expert knowledge on Starknet account abstraction, session management, and gasless transaction flows.

## How to Install

### Using the Skills CLI (Recommended)
You can add these skills to your local project using the `skills` CLI:

```bash
npx skills add cavos-labs/cavos-skills
```

### Manual Installation
If you prefer to install it manually:

1.  Create a `.agent/skills` folder in your project root.
2.  Clone this repository into it:
    ```bash
    git clone https://github.com/cavos-labs/cavos-skills.git .agent/skills/cavos-global
    ```

## Why use this?

Traditional documentation is for humans. **Skills** are for AI. By adding this repository to your project:
1.  Your AI agent will understand the 3-layer architecture of Cavos.
2.  It will know the "Synchronization Rule" for session policies (preventing security bugs).
3.  It will have access to proven implementation patterns in the `scripts/` directory.

---
Built with ⚡ by [Cavos Labs](https://cavos.network)
