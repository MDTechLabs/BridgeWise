import { WalletConnectionAnalytics } from "./walletConnectionAnalytics";

export function printWalletConnectionReport(
  analytics: WalletConnectionAnalytics
) {
  const report = analytics.generateReport();

  console.table(report);

  return report;
}