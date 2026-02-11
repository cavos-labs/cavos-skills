// multi-wallet.tsx
// Demonstrates: Creating and switching between named sub-wallets

import { useState, useEffect } from 'react';
import { useCavos } from '@cavos/react';

function MultiWalletManager() {
    const { getAssociatedWallets, switchWallet, address } = useCavos();
    const [wallets, setWallets] = useState<{ address: string; name?: string }[]>([]);

    useEffect(() => {
        loadWallets();
    }, []);

    const loadWallets = async () => {
        const found = await getAssociatedWallets();
        setWallets(found);
    };

    const handleSwitch = async (name?: string) => {
        await switchWallet(name);
        // address is now updated reactively via useCavos()
        await loadWallets(); // Refresh list
    };

    return (
        <div>
            <h2>Your Wallets</h2>
            <p>Active: {address}</p>

            {wallets.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span>{w.name || 'Default'}</span>
                    <code>{w.address.slice(0, 10)}...</code>
                    <button
                        onClick={() => handleSwitch(w.name)}
                        disabled={w.address === address}
                    >
                        {w.address === address ? 'Active' : 'Switch'}
                    </button>
                </div>
            ))}

            {/* Create new sub-wallet */}
            <button onClick={() => handleSwitch('Savings')}>
                Create "Savings" Wallet
            </button>
        </div>
    );
}

export default MultiWalletManager;
