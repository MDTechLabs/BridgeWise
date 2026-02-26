'use client';

import { useEffect, useLayoutEffect } from 'react';
import { isServer } from '../utils/env';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 * Avoids the React SSR warning about useLayoutEffect.
 */
export const useIsomorphicLayoutEffect = isServer
  ? useEffect
  : useLayoutEffect;
