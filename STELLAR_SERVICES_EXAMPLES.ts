/**
 * Example usage of Stellar bridge services
 * Demonstrates how to use the four implemented features together.
 */

// # CORS_ORIGIN: Comma-separated list of allowed origins
// # IMPORTANT: Never use * in production, always specify exact domains
import { SorobanSettlementVerifier } from './src/verification/settlements/stellar';
import { StellarTransferAuditAPI, AuditAction, AuditStatus } from './src/audit/transfers/stellar';
import { StellarTransferNotificationService, NotificationChannel, NotificationPriority } from './src/notifications/stellar';
import { SorobanContractVersionResolver, StellarEnvironment, ContractStatus } from './src/contracts/versioning/stellar';

/**
 * Example 1: Settlement Verification
 */
async function exampleSettlementVerification() {
  const verifier = new SorobanSettlementVerifier({
    horizonUrl: 'https://horizon-testnet.stellar.org',
    confirmationThreshold: 1,
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
  });

  // Verify a settlement
  const result = await verifier.verifySettlement({
    settlementId: 'settlement-001',
    sourceTransaction: 'abcd1234...',
    destinationTransaction: 'efgh5678...',
    expectedAmount: '100',
    expectedAsset: 'USDC',
    fromAddress: 'GAAA...',
    toAddress: 'GBBB...',
  });

  console.log('Settlement Verification Result:', result);

  // Get verification statistics
  const stats = verifier.getVerificationStats();
  console.log('Verification Stats:', stats);
}

/**
 * Example 2: Transfer Audit Logging & Search
 */
async function exampleAuditAPI() {
  const auditAPI = new StellarTransferAuditAPI({
    storageBackend: 'postgres',
    maxSearchResults: 10000,
    exportRetentionDays: 90,
    enableCompression: true,
  });

  // Log a transfer action
  const auditLog = auditAPI.logTransferAction({
    transferId: 'tx-123',
    action: AuditAction.TRANSFER_INITIATED,
    actor: 'user@example.com',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    fromAddress: 'GAAA...',
    toAddress: '0x1234...',
    amount: '100',
    assetCode: 'USDC',
    status: AuditStatus.PENDING,
  });

  console.log('Audit Log Created:', auditLog);

  // Search audit logs
  const searchResult = await auditAPI.search({
    transferIds: ['tx-123'],
    actions: [AuditAction.TRANSFER_INITIATED],
    limit: 50,
  });

  console.log('Search Results:', searchResult);

  // Get transfer history
  const history = await auditAPI.getTransferHistory('tx-123');
  console.log('Transfer History:', history);

  // Export audit logs
  const exportResult = await auditAPI.export({
    query: { startTime: Date.now() - 7 * 24 * 60 * 60 * 1000 },
    format: 'json' as const,
  });

  console.log('Export Result:', exportResult);

  // Get statistics
  const stats = await auditAPI.getStatistics();
  console.log('Audit Statistics:', stats);
}

/**
 * Example 3: Transfer Notifications
 */
async function exampleNotificationService() {
  const notifier = new StellarTransferNotificationService({
    maxRetries: 3,
    retryDelayMs: 5000,
    webhookTimeoutMs: 10000,
    enableWebhooks: true,
    enableEmailNotifications: false,
    enableUIAlerts: true,
    maxNotificationsInMemory: 1000,
  });

  // Subscribe to notifications
  const subscriber = notifier.subscribe({
    address: 'GAAA...',
    channels: [NotificationChannel.WEBHOOK, NotificationChannel.UI_ALERT],
    webhookUrl: 'https://my-app.com/webhook',
    preferences: {
      notifyOnInitiation: true,
      notifyOnCompletion: true,
      notifyOnFailure: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      minAmountToNotify: '10',
    },
  });

  console.log('Subscriber Created:', subscriber);

  // Notify on transfer completion
  await notifier.notifyTransferCompleted({
    transferId: 'tx-123',
    fromAddress: 'GAAA...',
    toAddress: 'GBBB...',
    amount: '100',
    assetCode: 'USDC',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
  });

  // Get delivery statistics
  const stats = notifier.getStatistics();
  console.log('Notification Stats:', stats);

  // Retry failed deliveries
  const retried = await notifier.retryFailedDeliveries();
  console.log('Retried deliveries:', retried);
}

/**
 * Example 4: Contract Version Resolution
 */
async function exampleVersionResolver() {
  const resolver = new SorobanContractVersionResolver({
    horizonUrl: 'https://horizon-testnet.stellar.org',
    cacheExpirationMs: 60000,
    maxRetries: 3,
    retryDelayMs: 1000,
    environments: [StellarEnvironment.TESTNET, StellarEnvironment.PUBLIC],
  });

  // Register a new contract version
  const activeInfo = resolver.registerVersion({
    contractId: 'CAU2YJ4XWQKZUADHZJ67H27NKAHQ3MK3NQRCMQKJ22RIRM32SFZKGGH',
    name: 'Bridge Token Transfer Contract',
    address: 'CAU2YJ4XWQKZUADHZJ67H27NKAHQ3MK3NQRCMQKJ22RIRM32SFZKGGH',
    version: '1.0.0',
    environment: StellarEnvironment.TESTNET,
    deployedBy: 'deployer@example.com',
    metadata: { description: 'v1.0.0 release' },
  });

  console.log('Active Contract Info:', activeInfo);

  // Resolve active version
  const resolved = await resolver.resolveActiveVersion(
    'CAU2YJ4XWQKZUADHZJ67H27NKAHQ3MK3NQRCMQKJ22RIRM32SFZKGGH',
    StellarEnvironment.TESTNET,
  );

  console.log('Resolved Version:', resolved);

  // Get all active contracts
  const activeContracts = resolver.getActiveContracts(StellarEnvironment.TESTNET);
  console.log('Active Contracts:', activeContracts);

  // Check version compatibility
  const compatibility = resolver.checkCompatibility('1.0.0', '1.1.0');
  console.log('Version Compatibility:', compatibility);

  // Get version statistics
  const stats = resolver.getStatistics();
  console.log('Version Statistics:', stats);
}

/**
 * Example 5: Integrated Workflow
 * Shows how services work together for a complete transfer lifecycle
 */
async function exampleIntegratedWorkflow() {
  const verifier = new SorobanSettlementVerifier();
  const auditAPI = new StellarTransferAuditAPI();
  const notifier = new StellarTransferNotificationService();
  const versionResolver = new SorobanContractVersionResolver();

  const transferId = 'tx-12345';
  const recipientAddress = 'GBBB...';

  // 1. Register contract version
  versionResolver.registerVersion({
    contractId: 'CAU2YJ4...',
    version: '1.0.0',
    environment: StellarEnvironment.TESTNET,
    deployedBy: 'system',
  });

  // 2. Subscribe recipient to notifications
  const subscriber = notifier.subscribe({
    address: recipientAddress,
    channels: [NotificationChannel.UI_ALERT],
    preferences: { notifyOnCompletion: true },
  });

  // 3. Log transfer initiation
  auditAPI.logTransferAction({
    transferId,
    action: AuditAction.TRANSFER_INITIATED,
    actor: 'user',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    fromAddress: 'GAAA...',
    toAddress: recipientAddress,
    amount: '100',
    assetCode: 'USDC',
    status: AuditStatus.PENDING,
  });

  // 4. Verify settlement
  const verificationResult = await verifier.verifySettlement({
    settlementId: transferId,
    sourceTransaction: 'src-tx',
    destinationTransaction: 'dst-tx',
    expectedAmount: '100',
    expectedAsset: 'USDC',
    fromAddress: 'GAAA...',
    toAddress: recipientAddress,
  });

  // 5. If verified, notify completion
  if (verificationResult.isValid) {
    await notifier.notifyTransferCompleted({
      transferId,
      fromAddress: 'GAAA...',
      toAddress: recipientAddress,
      amount: '100',
      assetCode: 'USDC',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
    });

    // Log completion
    auditAPI.logTransferAction({
      transferId,
      action: AuditAction.TRANSFER_COMPLETED,
      actor: 'system',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      fromAddress: 'GAAA...',
      toAddress: recipientAddress,
      amount: '100',
      assetCode: 'USDC',
      status: AuditStatus.COMPLETED,
    });
  } else {
    // Notify failure
    await notifier.notifyTransferFailed({
      transferId,
      fromAddress: 'GAAA...',
      toAddress: recipientAddress,
      amount: '100',
      assetCode: 'USDC',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      errorMessage: verificationResult.inconsistencies
        .map((i) => i.description)
        .join('; '),
    });

    // Log failure
    auditAPI.logTransferAction({
      transferId,
      action: AuditAction.TRANSFER_FAILED,
      actor: 'system',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      fromAddress: 'GAAA...',
      toAddress: recipientAddress,
      amount: '100',
      assetCode: 'USDC',
      status: AuditStatus.FAILED,
      errorMessage: 'Settlement verification failed',
    });
  }

  console.log('Integrated workflow completed');
}

// Run examples
async function runAllExamples() {
  console.log('=== Example 1: Settlement Verification ===');
  await exampleSettlementVerification().catch(console.error);

  console.log('\n=== Example 2: Audit API ===');
  await exampleAuditAPI().catch(console.error);

  console.log('\n=== Example 3: Notification Service ===');
  await exampleNotificationService().catch(console.error);

  console.log('\n=== Example 4: Version Resolver ===');
  await exampleVersionResolver().catch(console.error);

  console.log('\n=== Example 5: Integrated Workflow ===');
  await exampleIntegratedWorkflow().catch(console.error);
}

export {
  exampleSettlementVerification,
  exampleAuditAPI,
  exampleNotificationService,
  exampleVersionResolver,
  exampleIntegratedWorkflow,
  runAllExamples,
};
