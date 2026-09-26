import { TrustManager, StellarTrustProvider } from './trustManager';

// Create an instance of the TrustManager
const trustManager = new TrustManager();

// Create an instance of the StellarTrustProvider
const stellarTrustProvider = new StellarTrustProvider();

// Register the StellarTrustProvider with the TrustManager
trustManager.registerProvider('stellar', stellarTrustProvider);

// Get the Stellar provider from the manager
const stellarProvider = trustManager.getProvider('stellar');

if (stellarProvider) {
  // Simulate some events for a provider named 'ProviderA'
  stellarProvider.addEvent('ProviderA', { timestamp: Date.now(), type: 'success', details: 'Transaction 1 successful' });
  stellarProvider.addEvent('ProviderA', { timestamp: Date.now(), type: 'success', details: 'Transaction 2 successful' });
  stellarProvider.addEvent('ProviderA', { timestamp: Date.now(), type: 'failure', details: 'Transaction 3 failed' });
  stellarProvider.addEvent('ProviderA', { timestamp: Date.now(), type: 'failure', details: 'Transaction 4 failed' });
  stellarProvider.addEvent('ProviderA', { timestamp: Date.now(), type: 'success', details: 'Transaction 5 successful' });
  stellarProvider.addEvent('ProviderA', { timestamp: Date.now(), type: 'failure', details: 'Transaction 6 failed' });
  stellarProvider.addEvent('ProviderA', { timestamp: Date.now(), type: 'failure', details: 'Transaction 7 failed' });
  stellarProvider.addEvent('ProviderA', { timestamp: Date.now(), type: 'failure', details: 'Transaction 8 failed' });


  // Get the trust score for 'ProviderA'
  const score = stellarProvider.getTrustScore('ProviderA');
  console.log(`Trust score for ProviderA: ${score}`);

  // Check if 'ProviderA' is flagged
  const isFlagged = stellarProvider.isProviderFlagged('ProviderA');
  console.log(`Is ProviderA flagged? ${isFlagged}`);

  // Simulate events for another provider 'ProviderB'
  stellarProvider.addEvent('ProviderB', { timestamp: Date.now(), type: 'success', details: 'Transaction 1 successful' });
  stellarProvider.addEvent('ProviderB', { timestamp: Date.now(), type: 'success', details: 'Transaction 2 successful' });
  stellarProvider.addEvent('ProviderB', { timestamp: Date.now(), type: 'success', details: 'Transaction 3 successful' });

  const scoreB = stellarProvider.getTrustScore('ProviderB');
  console.log(`Trust score for ProviderB: ${scoreB}`);
  const isFlaggedB = stellarProvider.isProviderFlagged('ProviderB');
  console.log(`Is ProviderB flagged? ${isFlaggedB}`);

} else {
  console.error('Stellar provider not found in TrustManager.');
}