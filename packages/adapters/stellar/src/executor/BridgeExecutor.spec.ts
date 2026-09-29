import { StellarBridgeExecutor } from './BridgeExecutor';

describe('StellarBridgeExecutor pre-signing gate', () => {
  const transfer = {
    sourceChain: 'stellar',
    targetChain: 'ethereum',
    sourceAmount: '10000000',
    destinationAmount: '9900000',
    recipient: 'G'.padEnd(56, 'A'),
    fee: '100000',
    estimatedTime: 30,
  };

  function setup() {
    const wallet = {
      getConnection: jest.fn(() => ({
        publicKey: 'G'.padEnd(56, 'A'),
        isConnected: true,
        network: 'mainnet' as const,
      })),
      signTransaction: jest.fn(async () => ({
        signature: 'signed-payload',
        publicKey: 'G'.padEnd(56, 'A'),
        hash: 'tx-hash',
      })),
    };
    const bridgeContract = {
      prepareBridgeTransfer: jest.fn(async () => ({
        operation: 'bridge',
        params: { amount: transfer.sourceAmount },
      })),
      submitBridgeTransfer: jest.fn(async () => ({
        transactionHash: 'tx-hash',
        operationId: 'operation-1',
        status: 'pending' as const,
        bridgeAmount: transfer.sourceAmount,
        estimatedTime: 30,
      })),
    };
    const gate = {
      sign: jest.fn(async (context, signer) => ({ signed: await signer(context) })),
    };

    return {
      executor: new StellarBridgeExecutor(wallet as any, bridgeContract as any, gate),
      wallet,
      bridgeContract,
      gate,
    };
  }

  it('routes the prepared transaction through the readiness gate before signing', async () => {
    const { executor, wallet, bridgeContract, gate } = setup();

    const result = await executor.executeTransfer(transfer);

    expect(result.success).toBe(true);
    expect(gate.sign).toHaveBeenCalledTimes(1);
    expect(gate.sign.mock.invocationCallOrder[0]).toBeLessThan(
      wallet.signTransaction.mock.invocationCallOrder[0],
    );
    expect(gate.sign.mock.calls[0][0]).toMatchObject({
      transfer,
      walletConnection: { network: 'mainnet', isConnected: true },
      preparedTransaction: { operation: 'bridge' },
    });
    expect(bridgeContract.submitBridgeTransfer).toHaveBeenCalledWith(
      'signed-payload',
    );
  });

  it('does not sign or submit when the readiness gate rejects', async () => {
    const { executor, wallet, bridgeContract, gate } = setup();
    gate.sign.mockRejectedValue(new Error('readiness gate blocked signing'));

    const result = await executor.executeTransfer(transfer);

    expect(result.success).toBe(false);
    expect(wallet.signTransaction).not.toHaveBeenCalled();
    expect(bridgeContract.submitBridgeTransfer).not.toHaveBeenCalled();
  });
});
