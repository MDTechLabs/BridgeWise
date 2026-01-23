import { callApi, BridgeProvider } from '@bridgewise/bridge-core';

const stellarProvider: BridgeProvider = {
  name: 'Stellar',
  apiUrl: 'https://stellar-bridge.example.com/api',
};

const layerZeroProvider: BridgeProvider = {
    name: 'LayerZero',
    apiUrl: 'https://layerzero-bridge.example.com/api',
};

async function main() {
  console.log('--- Simulating API calls to Stellar ---');
  for (let i = 0; i < 10; i++) {
    console.log(`\nRequest #${i + 1}`);
    const response = await callApi({
      provider: stellarProvider,
      payload: { amount: 100, asset: 'USDC' },
    });
    console.log('Response:', response);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n--- Simulating API calls to LayerZero ---');
  for (let i = 0; i < 10; i++) {
    console.log(`\nRequest #${i + 1}`);
    const response = await callApi({
        provider: layerZeroProvider,
        payload: { amount: 100, asset: 'USDC' },
    });
    console.log('Response:', response);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
