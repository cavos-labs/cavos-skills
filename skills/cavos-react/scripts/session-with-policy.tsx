// session-with-policy.tsx
// Demonstrates: Policy sync before session activation

import { useCavos } from '@cavos/react';
import type { SessionKeyPolicy } from '@cavos/react';

const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const ETH = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

function SessionActivation() {
    const {
        updateSessionPolicy,
        registerCurrentSession,
        walletStatus
    } = useCavos();

    // ═══════════════════════════════════════════════
    // The CORRECT way to activate a session with policy
    // ═══════════════════════════════════════════════

    const handleActivate = async () => {
        // Step 1: Define (or fetch) the latest policy
        const policy: SessionKeyPolicy = {
            allowedContracts: [STRK, ETH],
            maxCallsPerTx: 5,
            spendingLimits: [
                { token: STRK, limit: BigInt(50 * 10 ** 18) },  // 50 STRK
                { token: ETH, limit: BigInt(1 * 10 ** 16) },    // 0.01 ETH
            ]
        };

        // Step 2: SYNC the policy to the SDK
        // This MUST happen before registerCurrentSession()
        updateSessionPolicy(policy);

        // Step 3: Register on-chain
        const txHash = await registerCurrentSession();
        console.log('Session registered with policy:', txHash);
    };

    return (
        <div>
            <p>Session Active: {walletStatus.isSessionActive ? '✅' : '❌'}</p>
            <button onClick={handleActivate}>
                Activate Session
            </button>
        </div>
    );
}

export default SessionActivation;
