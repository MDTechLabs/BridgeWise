import {
  TransferNotification,
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  NotificationSubscriber,
  DeliveryReceipt,
  DeliveryStatus,
  NotificationServiceConfig,
  NotificationStats,
  WebhookEvent,
  NotificationPreferences,
} from './notification.types';
import { randomUUID } from 'crypto';

/**
 * Service for managing Stellar bridge transfer notifications.
 * Emits transfer updates through multiple channels including webhooks and UI alerts.
 * Supports subscriber management and delivery tracking.
 *
 * @example
 * const notifier = new StellarTransferNotificationService({
 *   maxRetries: 3,
 *   retryDelayMs: 5000,
 *   webhookTimeoutMs: 10000,
 *   enableWebhooks: true,
 *   enableEmailNotifications: false,
 *   enableUIAlerts: true,
 *   maxNotificationsInMemory: 1000,
 * });
 *
 * const subscriber = notifier.subscribe({
 *   address: 'GBNX...',
 *   channels: [NotificationChannel.UI_ALERT, NotificationChannel.WEBHOOK],
 *   webhookUrl: 'https://my-app.com/hook',
 *   preferences: { notifyOnCompletion: true, notifyOnFailure: true },
 * });
 *
 * await notifier.notifyTransferCompleted({
 *   transferId: 'tx-123',
 *   fromAddress: 'sender',
 *   toAddress: 'receiver',
 *   amount: '100',
 *   assetCode: 'USDC',
 *   sourceChain: 'stellar',
 *   destinationChain: 'ethereum',
 *   status: 'completed',
 * });
 */
export class StellarTransferNotificationService {
  private readonly config: NotificationServiceConfig;
  private subscribers = new Map<string, NotificationSubscriber>();
  private notifications: TransferNotification[] = [];
  private deliveryReceipts = new Map<string, DeliveryReceipt>();
  private stats: NotificationStats = {
    totalNotifications: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    averageDeliveryTimeMs: 0,
    subscriberCount: 0,
  };

  constructor(config: Partial<NotificationServiceConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 5000,
      webhookTimeoutMs: config.webhookTimeoutMs || 10000,
      enableWebhooks: config.enableWebhooks !== false,
      enableEmailNotifications: config.enableEmailNotifications || false,
      enableUIAlerts: config.enableUIAlerts !== false,
      maxNotificationsInMemory: config.maxNotificationsInMemory || 1000,
    };
  }

  /**
   * Subscribe to transfer notifications
   */
  subscribe(input: {
    address: string;
    channels: NotificationChannel[];
    webhookUrl?: string;
    email?: string;
    phoneNumber?: string;
    preferences?: Partial<NotificationPreferences>;
  }): NotificationSubscriber {
    const subscriber: NotificationSubscriber = {
      subscriberId: randomUUID(),
      address: input.address,
      channels: input.channels,
      webhookUrl: input.webhookUrl,
      email: input.email,
      phoneNumber: input.phoneNumber,
      preferences: {
        notifyOnInitiation: input.preferences?.notifyOnInitiation !== false,
        notifyOnCompletion: input.preferences?.notifyOnCompletion !== false,
        notifyOnFailure: input.preferences?.notifyOnFailure !== false,
        notifyOnDelay: input.preferences?.notifyOnDelay !== false,
        minAmountToNotify: input.preferences?.minAmountToNotify,
        quietHoursStart: input.preferences?.quietHoursStart,
        quietHoursEnd: input.preferences?.quietHoursEnd,
        unsubscribedTypes: input.preferences?.unsubscribedTypes,
      },
      createdAt: Date.now(),
      isActive: true,
    };

    this.subscribers.set(subscriber.subscriberId, subscriber);
    this.stats.subscriberCount = this.subscribers.size;

    return subscriber;
  }

  /**
   * Unsubscribe from notifications
   */
  unsubscribe(subscriberId: string): boolean {
    return this.subscribers.delete(subscriberId);
  }

  /**
   * Update subscriber preferences
   */
  updateSubscriber(
    subscriberId: string,
    updates: Partial<NotificationSubscriber>,
  ): NotificationSubscriber | undefined {
    const subscriber = this.subscribers.get(subscriberId);
    if (!subscriber) return undefined;

    const updated = { ...subscriber, ...updates };
    this.subscribers.set(subscriberId, updated);
    return updated;
  }

  /**
   * Get subscriber by ID
   */
  getSubscriber(subscriberId: string): NotificationSubscriber | undefined {
    return this.subscribers.get(subscriberId);
  }

  /**
   * Get all subscribers for an address
   */
  getSubscribersByAddress(address: string): NotificationSubscriber[] {
    return Array.from(this.subscribers.values()).filter(
      (s) => s.address === address && s.isActive,
    );
  }

  /**
   * Notify on transfer initiation
   */
  async notifyTransferInitiated(data: {
    transferId: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    assetCode: string;
    sourceChain: string;
    destinationChain: string;
  }): Promise<void> {
    await this.sendNotification({
      transferId: data.transferId,
      type: 'transfer.initiated',
      priority: NotificationPriority.MEDIUM,
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      amount: data.amount,
      assetCode: data.assetCode,
      status: 'initiated',
      message: `Transfer of ${data.amount} ${data.assetCode} initiated from ${data.sourceChain}`,
      filterByPreference: 'notifyOnInitiation',
    });
  }

  /**
   * Notify on transfer completion
   */
  async notifyTransferCompleted(data: {
    transferId: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    assetCode: string;
    sourceChain: string;
    destinationChain: string;
  }): Promise<void> {
    await this.sendNotification({
      transferId: data.transferId,
      type: 'transfer.completed',
      priority: NotificationPriority.HIGH,
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      amount: data.amount,
      assetCode: data.assetCode,
      status: 'completed',
      message: `Transfer of ${data.amount} ${data.assetCode} completed successfully`,
      filterByPreference: 'notifyOnCompletion',
    });
  }

  /**
   * Notify on transfer failure
   */
  async notifyTransferFailed(data: {
    transferId: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    assetCode: string;
    sourceChain: string;
    destinationChain: string;
    errorMessage: string;
  }): Promise<void> {
    await this.sendNotification({
      transferId: data.transferId,
      type: 'transfer.failed',
      priority: NotificationPriority.CRITICAL,
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      amount: data.amount,
      assetCode: data.assetCode,
      status: 'failed',
      message: `Transfer failed: ${data.errorMessage}`,
      errorMessage: data.errorMessage,
      filterByPreference: 'notifyOnFailure',
    });
  }

  /**
   * Notify on transfer delay
   */
  async notifyTransferDelayed(data: {
    transferId: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    assetCode: string;
    sourceChain: string;
    destinationChain: string;
    delayedMs: number;
  }): Promise<void> {
    await this.sendNotification({
      transferId: data.transferId,
      type: 'transfer.delayed',
      priority: NotificationPriority.MEDIUM,
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      amount: data.amount,
      assetCode: data.assetCode,
      status: 'delayed',
      message: `Transfer delayed for ${Math.round(data.delayedMs / 1000)} seconds`,
      filterByPreference: 'notifyOnDelay',
    });
  }

  /**
   * Notify on bridge system warning/health alert
   */
  async notifyBridgeWarning(data: {
    routeId: string;
    status: string;
    message: string;
    priority?: NotificationPriority;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.sendNotification({
      transferId: `bridge-alert-${data.routeId}`,
      type: 'bridge.warning',
      priority: data.priority || NotificationPriority.HIGH,
      sourceChain: 'stellar',
      destinationChain: 'multiple',
      fromAddress: 'system',
      toAddress: 'admin',
      amount: '0',
      assetCode: 'SYSTEM',
      status: data.status,
      message: data.message,
    });
  }

  /**
   * Get delivery receipt for a notification
   */
  getDeliveryReceipt(receiptId: string): DeliveryReceipt | undefined {
    return this.deliveryReceipts.get(receiptId);
  }

  /**
   * Get delivery receipts for a notification
   */
  getDeliveryReceiptsByNotification(
    notificationId: string,
  ): DeliveryReceipt[] {
    return Array.from(this.deliveryReceipts.values()).filter(
      (r) => r.notificationId === notificationId,
    );
  }

  /**
   * Get notification statistics
   */
  getStatistics(): NotificationStats {
    return { ...this.stats };
  }

  /**
   * Get notification history
   */
  getNotificationHistory(
    transferId?: string,
    limit = 100,
  ): TransferNotification[] {
    let notifications = this.notifications;

    if (transferId) {
      notifications = notifications.filter((n) => n.transferId === transferId);
    }

    return notifications.slice(-limit);
  }

  /**
   * Retry failed deliveries
   */
  async retryFailedDeliveries(): Promise<number> {
    const failedReceipts = Array.from(this.deliveryReceipts.values()).filter(
      (r) => r.status === DeliveryStatus.FAILED && r.retryCount < this.config.maxRetries,
    );

    for (const receipt of failedReceipts) {
      const notification = this.notifications.find(
        (n) => n.notificationId === receipt.notificationId,
      );
      if (notification) {
        await this.deliverNotification(notification, receipt.channel);
      }
    }

    return failedReceipts.length;
  }

  // Private methods

  private async sendNotification(data: {
    transferId: string;
    type: NotificationType;
    priority: NotificationPriority;
    sourceChain: string;
    destinationChain: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    assetCode: string;
    status: string;
    message: string;
    errorMessage?: string;
    filterByPreference?: keyof NotificationPreferences;
  }): Promise<void> {
    const notification: TransferNotification = {
      notificationId: randomUUID(),
      transferId: data.transferId,
      type: data.type,
      priority: data.priority,
      timestamp: Date.now(),
      sourceChain: data.sourceChain,
      destinationChain: data.destinationChain,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      amount: data.amount,
      assetCode: data.assetCode,
      status: data.status,
      message: data.message,
      errorMessage: data.errorMessage,
      channels: [],
      delivered: false,
      deliveryAttempts: 0,
    };

    // Add to history
    this.notifications.push(notification);
    if (this.notifications.length > this.config.maxNotificationsInMemory) {
      this.notifications.shift();
    }

    // Get relevant subscribers
    const subscribers = this.getSubscribersByAddress(data.toAddress);

    for (const subscriber of subscribers) {
      // Check preferences
      if (
        data.filterByPreference &&
        !subscriber.preferences[data.filterByPreference]
      ) {
        continue;
      }

      if (
        subscriber.preferences.unsubscribedTypes?.includes(data.type)
      ) {
        continue;
      }

      // Check quiet hours
      if (this.isInQuietHours(subscriber.preferences)) {
        continue;
      }

      // Check minimum amount
      if (subscriber.preferences.minAmountToNotify) {
        const minAmount = parseFloat(subscriber.preferences.minAmountToNotify);
        const notifyAmount = parseFloat(data.amount);
        if (notifyAmount < minAmount) {
          continue;
        }
      }

      // Deliver through configured channels
      for (const channel of subscriber.channels) {
        await this.deliverNotification(notification, channel);
      }
    }

    this.stats.totalNotifications++;
  }

  private async deliverNotification(
    notification: TransferNotification,
    channel: NotificationChannel,
  ): Promise<void> {
    const receiptId = randomUUID();
    const receipt: DeliveryReceipt = {
      receiptId,
      notificationId: notification.notificationId,
      channel,
      status: DeliveryStatus.PENDING,
      retryCount: 0,
    };

    let success = false;

    try {
      switch (channel) {
        case NotificationChannel.WEBHOOK:
          if (this.config.enableWebhooks) {
            success = await this.deliverViaWebhook(notification);
          }
          break;

        case NotificationChannel.UI_ALERT:
          if (this.config.enableUIAlerts) {
            success = await this.deliverViaUIAlert(notification);
          }
          break;

        case NotificationChannel.EMAIL:
          if (this.config.enableEmailNotifications) {
            success = await this.deliverViaEmail(notification);
          }
          break;
      }

      if (success) {
        receipt.status = DeliveryStatus.DELIVERED;
        receipt.deliveredAt = Date.now();
        this.stats.successfulDeliveries++;
      } else {
        receipt.status = DeliveryStatus.FAILED;
        this.stats.failedDeliveries++;
      }
    } catch (error) {
      receipt.status = DeliveryStatus.FAILED;
      receipt.failureReason = error instanceof Error ? error.message : 'Unknown error';
      receipt.retryCount++;
      this.stats.failedDeliveries++;
    }

    this.deliveryReceipts.set(receiptId, receipt);
  }

  private async deliverViaWebhook(notification: TransferNotification): Promise<boolean> {
    // In real implementation, would look up subscriber webhook URL
    const webhookUrl = 'https://example.com/webhook'; // Placeholder

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: notification.notificationId,
          type: notification.type,
          timestamp: notification.timestamp,
          data: notification,
        } as WebhookEvent),
        signal: AbortSignal.timeout(this.config.webhookTimeoutMs),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async deliverViaUIAlert(notification: TransferNotification): Promise<boolean> {
    // In real implementation, would emit to connected UI clients
    // For now, just return success
    return true;
  }

  private async deliverViaEmail(notification: TransferNotification): Promise<boolean> {
    // In real implementation, would send via email service
    // For now, just return success
    return true;
  }

  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const [startHour] = preferences.quietHoursStart.split(':').map(Number);
    const [endHour] = preferences.quietHoursEnd.split(':').map(Number);

    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    }

    return currentHour >= startHour || currentHour < endHour;
  }
}
