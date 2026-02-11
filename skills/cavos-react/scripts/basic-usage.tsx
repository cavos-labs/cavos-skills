// basic-usage.tsx
// Minimal Cavos integration: Login + Transfer

import { CavosProvider, useCavos } from '@cavos/react';

// ═══════════════════════════════════════════════
// 1. Wrap your app in CavosProvider
// ═══════════════════════════════════════════════

const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

function App() {
    return (
        <CavosProvider config={{
            appId: 'YOUR_APP_ID',
            network: 'sepolia',
            session: {
                defaultPolicy: {
                    allowedContracts: [STRK],
                    maxCallsPerTx: 3,
                    spendingLimits: [{
                        token: STRK,
                        limit: BigInt(100 * 10 ** 18) // 100 STRK max
                    }]
                }
            }
        }}>
            <WalletDashboard />
        </CavosProvider>
    );
}

// ═══════════════════════════════════════════════
// 2. Use the hook in any child component
// ═══════════════════════════════════════════════

function WalletDashboard() {
    const {
        isAuthenticated,
        address,
        user,
        login,
        logout,
        execute,
        isLoading,
        walletStatus
    } = useCavos();

    if (isLoading) return <div>Loading...</div>;

    if (!isAuthenticated) {
        return (
            <div>
                <button onClick={() => login('google')}>Login with Google</button>
                <button onClick={() => login('apple')}>Login with Apple</button>
            </div>
        );
    }

    const handleTransfer = async () => {
        const recipient = '0x123...'; // Target address
        const amount = BigInt(1 * 10 ** 18); // 1 STRK
        const amountLow = (amount & ((1n << 128n) - 1n)).toString();
        const amountHigh = (amount >> 128n).toString();

        try {
            const txHash = await execute({
                contractAddress: STRK,
                entrypoint: 'transfer',
                calldata: [recipient, amountLow, amountHigh]
            });
            console.log('Transfer successful:', txHash);
        } catch (err) {
            console.error('Transfer failed:', err);
        }
    };

    return (
        <div>
            <p>Welcome, {user?.name}</p>
            <p>Address: {address}</p>
            <p>Deployed: {walletStatus.isDeployed ? '✅' : '⏳'}</p>
            <button onClick={handleTransfer}>Send 1 STRK</button>
            <button onClick={logout}>Logout</button>
        </div>
    );
}

export default App;
