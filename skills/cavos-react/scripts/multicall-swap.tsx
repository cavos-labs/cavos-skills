// multicall-swap.tsx
// Demonstrates: ERC-20 approve + DEX swap in a single atomic transaction

import { useCavos } from '@cavos/react';
import { uint256 } from 'starknet';

const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const USDC = '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8';
const ROUTER = '0xROUTER_CONTRACT_ADDRESS'; // Replace with actual router

function SwapButton() {
    const { execute } = useCavos();

    const handleSwap = async () => {
        const amountIn = BigInt(10 * 10 ** 18); // 10 STRK
        const minAmountOut = BigInt(5 * 10 ** 6); // 5 USDC (6 decimals!)

        // uint256 representation for Starknet: [low_128, high_128]
        const amountInU256 = uint256.bnToUint256(amountIn);
        const minOutU256 = uint256.bnToUint256(minAmountOut);

        try {
            // Multicall: approve + swap in one atomic transaction
            const txHash = await execute([
                // Call 1: Approve router to spend STRK
                {
                    contractAddress: STRK,
                    entrypoint: 'approve',
                    calldata: [
                        ROUTER,
                        amountInU256.low.toString(),
                        amountInU256.high.toString()
                    ]
                },
                // Call 2: Execute swap
                {
                    contractAddress: ROUTER,
                    entrypoint: 'swap_exact_tokens_for_tokens',
                    calldata: [
                        amountInU256.low.toString(),
                        amountInU256.high.toString(),
                        minOutU256.low.toString(),
                        minOutU256.high.toString(),
                        // ... additional router-specific params
                    ]
                }
            ]);

            console.log('Swap executed:', txHash);
        } catch (err: any) {
            if (err.message?.includes('Spending limit exceeded')) {
                alert('Swap amount exceeds your session spending limit.');
            } else {
                console.error('Swap failed:', err);
            }
        }
    };

    return <button onClick={handleSwap}>Swap 10 STRK → USDC</button>;
}

export default SwapButton;
