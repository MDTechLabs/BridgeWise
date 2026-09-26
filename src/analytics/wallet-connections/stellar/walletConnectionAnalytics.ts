import {
  WalletConnectionEvent,
  WalletConnectionReport,
} from "./types";

export class WalletConnectionAnalytics {
  private events: WalletConnectionEvent[] = [];

  recordAttempt(
    walletName: string,
    duration: number,
    success: boolean,
    error?: string
  ) {
    this.events.push({
      walletName,
      duration,
      timestamp: Date.now(),
      status: success ? "success" : "failed",
      error,
    });
  }

  recordCancelled(walletName: string, duration: number) {
    this.events.push({
      walletName,
      duration,
      timestamp: Date.now(),
      status: "cancelled",
    });
  }

  getEvents() {
    return [...this.events];
  }

  clear() {
    this.events = [];
  }

  generateReport(): WalletConnectionReport {
    const totalAttempts = this.events.length;

    const successfulConnections = this.events.filter(
      e => e.status === "success"
    ).length;

    const failedConnections = this.events.filter(
      e => e.status === "failed"
    ).length;

    const cancelledConnections = this.events.filter(
      e => e.status === "cancelled"
    ).length;

    const averageConnectionTime =
      totalAttempts === 0
        ? 0
        : this.events.reduce((sum, e) => sum + e.duration, 0) /
          totalAttempts;

    return {
      totalAttempts,
      successfulConnections,
      failedConnections,
      cancelledConnections,
      successRate:
        totalAttempts === 0
          ? 0
          : Number(
              (
                (successfulConnections / totalAttempts) *
                100
              ).toFixed(2)
            ),
      averageConnectionTime,
    };
  }
}