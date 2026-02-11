import { useCavos } from '@cavos/react';
import { constants } from 'starknet';

export function TransferButton() {
    const { address, execute, updateSessionPolicy, registerCurrentSession, walletStatus } = useCavos();

    const handleTransfer = async () => {
        // 1. Ensure session is registered with correct policy
        if (!walletStatus.isSessionActive) {
            updateSessionPolicy({
                allowedContracts: ['0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'], // STRK address
                maxCallsPerTx: 1,
                spendingLimits: [{
                    token: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
                    limit: BigInt(10 * 10 ** 18) // 10 STRK
                }]
            });
            await registerCurrentSession();
        }

        // 2. Execute transfer
        const tx = await execute({
            contractAddress: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
            entrypoint: 'transfer',
            calldata: ['0xRecipient...', '1000000000000000000', '0']
        });

        console.log('Transaction hash:', tx);
    };

    return <button onClick={handleTransfer}>Transfer 1 STRK</button>;
}
