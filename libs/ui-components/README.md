# @bridgewise/ui-components

BridgeWise UI SDK components and hooks for cross-chain UX.

## Theming Guide

BridgeWise exposes a flexible, type-safe theming system that can be used globally or per app.

### BridgeWiseTheme

For simple integrations, you can use the high-level `BridgeWiseTheme` interface:

```ts
import type { BridgeWiseTheme } from '@bridgewise/ui-components';

const theme: BridgeWiseTheme = {
  primaryColor: '#22c55e',
  secondaryColor: '#0f172a',
  backgroundColor: '#020617',
  textColor: '#e5e7eb',
  borderRadius: '16px',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  spacingUnit: '0.9rem',
};
```

### BridgeWiseProvider

Wrap your dApp (or specific sections) with `BridgeWiseProvider` to inject theme tokens and CSS variables:

```tsx
import {
  BridgeWiseProvider,
  TransactionHeartbeat,
  BridgeStatus,
} from '@bridgewise/ui-components';

const customTheme = {
  primaryColor: '#22c55e',
  backgroundColor: '#020617',
  textColor: '#e5e7eb',
};

export function App() {
  return (
    <BridgeWiseProvider theme={customTheme} defaultMode="dark">
      {/* Your app + BridgeWise components */}
      <BridgeStatus /* ...props */ />
      <TransactionHeartbeat />
    </BridgeWiseProvider>
  );
}
```

Under the hood this is mapped into the full token-based `Theme` object and converted into CSS variables with the `--bw-` prefix, e.g.:

- `--bw-colors-transaction-background`
- `--bw-colors-foreground-primary`
- `--bw-spacing-md`
- `--bw-typography-font-size-sm`

You can also pass a full `DeepPartial<Theme>` instead of `BridgeWiseTheme` for complete control.

### Dark Mode

The theme system supports light/dark mode with a `ThemeMode`:

- `'light'`
- `'dark'`
- `'system'` (default)

`BridgeWiseProvider` forwards `defaultMode`, `enableSystem`, and related props to the underlying `ThemeProvider`. Dark mode uses the built-in `darkTheme` token overrides.

### Component-level overrides

All public UI components support `className` and/or `style` overrides to match your design system:

- `TransactionHeartbeat` – `className`, `style`
- `BridgeStatus` – `className`, `style`
- `BridgeHistory` – `className`, `style`
- `BridgeCompare` – `className`, `style`

Example:

```tsx
<TransactionHeartbeat className="left-4 right-auto" />
<BridgeCompare className="rounded-xl border border-slate-800" />
```

### CSS variable mapping

If you need to integrate with Tailwind or other CSS-in-JS systems, you can rely on the generated CSS variables:

```ts
import { generateCSSVariables, defaultTheme } from '@bridgewise/ui-components';

const cssVars = generateCSSVariables(defaultTheme);
// cssVars['--bw-colors-transaction-background'] => '#ffffff'
```

These variables are applied at the `document.documentElement` level by `ThemeProvider`, and are safe to use in custom styles as `var(--bw-...)`.

---

## Transaction History

The transaction history module provides a unified view across Stellar and EVM bridge executions.

### Data model

```ts
interface BridgeTransaction {
  txHash: string;
  bridgeName: string;
  sourceChain: string;
  destinationChain: string;
  sourceToken: string;
  destinationToken: string;
  amount: number;
  fee: number;
  slippagePercent: number;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: Date;
  account: string;
}
```

### Hook usage

```tsx
import { useTransactionHistory } from '@bridgewise/ui-components';

const transactions = useTransactionHistory(account).transactions;
```

### Filtering and sorting

```tsx
const { transactions } = useTransactionHistory(account, {
  filter: {
    chain: 'ethereum',
    bridgeName: 'layerzero',
    status: 'confirmed',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
  },
  sortOrder: 'desc',
  includeBackend: true,
});
```

### Demo component

```tsx
import { BridgeHistory } from '@bridgewise/ui-components';

<BridgeHistory account={account} status="confirmed" />;
```

### Real-Time Transaction Status

In addition to viewing historical records, you can subscribe to live updates for a specific transaction. This is useful when you need to show a spinner, send notifications or update other parts of your UI as the bridge work progresses (e.g. refresh quotes, run slippage checks).

```tsx
import { useTransactionStatus } from '@bridgewise/ui-components';

function TransactionTracker({ txId }: { txId: string }) {
  const { status, loading, error, lastUpdate } = useTransactionStatus(txId, {
    pollingIntervalMs: 3000,
    notifications: true, // browser notification when status changes
    onStatusChange: (s) => console.log('status:', s),
  });

  return (
    <div>
      {loading && <span>Connecting...</span>}
      <div>Status: {status || 'unknown'}</div>
      {error && <div className="error">{error.message}</div>}
      {lastUpdate && <small>Updated {lastUpdate.toISOString()}</small>}
    </div>
  );
}
```

Support also exists for storing status updates in the same history used by `useTransactionHistory` via the `historyConfig`/`account` options.

### Storage configuration
### Storage configuration

By default, history is persisted in browser local storage.

For server-side tracking, configure an optional backend in `TransactionProvider`:

```tsx
import {
  TransactionProvider,
  createHttpTransactionHistoryBackend,
} from '@bridgewise/ui-components';

const historyBackend = createHttpTransactionHistoryBackend({
  baseUrl: 'https://api.bridgewise.example.com',
});

<TransactionProvider
  historyConfig={{ backend: historyBackend }}
  onTransactionTracked={(tx) => {
    console.log('Tracked transaction', tx.txHash);
  }}
>
  {children}
</TransactionProvider>;
```

## Multi-Bridge Liquidity Monitoring

Use `useBridgeLiquidity()` to fetch live liquidity per bridge, token, and chain pair.

### Hook usage

```tsx
import { useBridgeLiquidity } from '@bridgewise/ui-components';

const { liquidity, refreshLiquidity } = useBridgeLiquidity({
  token: 'USDC',
  sourceChain: 'Ethereum',
  destinationChain: 'Stellar',
});
```

### Integration examples

- `BridgeCompare` prioritizes higher-liquidity routes and warns/disables low-liquidity options.
- `BridgeStatus` (`TransactionHeartbeat`) can show liquidity alerts via `state.liquidityAlert`.

### Fallback and errors

- If provider APIs fail, the monitor returns last-known cached liquidity (when available).
- Structured provider errors are returned as `{ bridgeName, message }[]`.
- Manual refresh is supported through `refreshLiquidity()` and optional polling via `refreshIntervalMs`.

## Wallet Connection & Multi-Account Support

BridgeWise UI SDK supports connecting multiple wallets (MetaMask, Stellar, etc.) and switching between accounts dynamically. This enables professional dApps to offer secure, flexible wallet management for users.

### Key Hooks

```tsx
import {
  useWalletConnections,
  useActiveAccount,
  WalletConnector,
  MultiWalletProvider,
} from '@bridgewise/ui-components';

// Access all connected wallets and accounts
const {
  wallets,
  connectWallet,
  disconnectWallet,
  switchAccount,
  activeAccount,
  activeWallet,
  error,
} = useWalletConnections();

// Get the current active account and wallet
const { activeAccount, activeWallet } = useActiveAccount();
```

### Demo Component

```tsx
<MultiWalletProvider>
  <WalletConnector />
  {/* ...rest of your app... */}
</MultiWalletProvider>
```

### Features
- Connect/disconnect multiple wallets (EVM, Stellar, etc.)
- Switch between accounts and maintain correct transaction context
- SSR-safe and production-ready
- Integrates with network switching, fee estimation, transaction history, and headless mode
- UI demo component for wallet/account management

### Example Usage
```tsx
const { wallets, connectWallet, switchAccount, activeAccount } = useWalletConnections();
```

### Supported Wallet Types
- MetaMask
- WalletConnect
- Stellar (Freighter, etc.)

### Error Handling
- Graceful handling of wallet disconnection
- Structured errors for unsupported wallets
- Ensures active account is always valid before executing transfers

### Testing
- Unit tests cover connection, disconnection, account switching, and error handling

## Headless Mode

BridgeWise now supports a fully configurable headless mode for all core hooks and logic modules. Use the `HeadlessConfig` interface to control auto-refresh, slippage, network, and account context for your custom UI integrations.

### HeadlessConfig

```ts
interface HeadlessConfig {
  autoRefreshQuotes?: boolean;
  slippageThreshold?: number;
  network?: string;
  account?: string;
}
```

### Example Usage

```tsx
import { useBridgeQuotes, useTokenValidation, useNetworkSwitcher } from '@bridgewise/ui-components/hooks/headless';

const { quotes, refresh } = useBridgeQuotes({
  config: { autoRefreshQuotes: true, network: 'Ethereum', account: '0x123...' },
  initialParams: { sourceChain: 'stellar', destinationChain: 'ethereum', sourceToken: 'USDC', destinationToken: 'USDC', amount: '100' },
});

const { isValid, errors } = useTokenValidation('USDC', 'Ethereum', 'Stellar');
const { currentNetwork, switchNetwork } = useNetworkSwitcher();
```

### Features
- All core hooks and logic modules are UI-independent
- Hooks accept `HeadlessConfig` for custom integration
- SSR-safe and compatible with Next.js
- Full integration with fees, slippage, ranking, network switching, and transaction tracking
- Strong TypeScript types exported

### SSR & Error Handling
- All hooks avoid DOM/window usage for SSR safety
- Graceful error handling for unsupported or incomplete data
- Clear error messages for unsupported headless operations

### Testing
- Hooks are unit-testable in headless mode
- Event callbacks and state transitions are fully supported

## Dynamic Network Switching

BridgeWise supports dynamic network switching for seamless multi-chain UX. Use the provided hook to detect and switch networks programmatically or via UI, with automatic updates to dependent modules (fees, slippage, quotes).

### useNetworkSwitcher Hook

```tsx
import { useNetworkSwitcher } from '@bridgewise/ui-components/hooks/headless';

const { currentNetwork, switchNetwork, isSwitching, error, supportedNetworks } = useNetworkSwitcher();

// Switch to Polygon
switchNetwork('Polygon');
```

- `currentNetwork`: The currently active network/chain ID
- `switchNetwork(targetChain)`: Switches to the specified chain
- `isSwitching`: Boolean indicating if a switch is in progress
- `error`: Structured error if switching fails
- `supportedNetworks`: List of supported chain IDs for the active wallet

### Features
- SSR-safe and headless compatible
- Automatic updates to fee, slippage, and quote hooks
- Graceful error handling and fallback
- UI components can reflect network changes automatically

### Example Integration
```tsx
const { currentNetwork, switchNetwork } = useNetworkSwitcher();
switchNetwork('Polygon');
```

### Error Handling
- If the wallet does not support the target network, a structured error is returned
- No UI or quote calculation is broken during network transitions
