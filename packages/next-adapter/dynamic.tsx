'use client';

import dynamic from 'next/dynamic';
import type { ClientOnlyProps } from '@bridgewise/ui-components';
import type { BridgeStatusProps as BridgeWidgetProps } from '@bridgewise/ui-components';

/**
 * Dynamically imported `BridgeWidget` with SSR disabled.
 * Drop-in replacement for App Router and Pages Router.
 */
export const BridgeStatusDynamic = dynamic<BridgeWidgetProps>(
  () => import('@bridgewise/ui-components').then((m) => m.BridgeStatus),
  { ssr: false },
);

export const BridgeCompareDynamic = dynamic(
  () => import('@bridgewise/ui-components').then((m) => m.BridgeCompare),
  { ssr: false },
);

/**
 * Dynamically imported `ClientOnly` with SSR disabled.
 */
export const ClientOnlyDynamic = dynamic<ClientOnlyProps>(
  () => import('@bridgewise/ui-components').then((m) => m.ClientOnly),
  { ssr: false },
);
