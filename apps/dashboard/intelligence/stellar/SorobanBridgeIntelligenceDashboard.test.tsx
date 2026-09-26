/**
 * File: apps/dashboard/intelligence/stellar/SorobanBridgeIntelligenceDashboard.test.tsx
 *
 * Lightweight smoke + interaction tests for the Soroban Bridge
 * Intelligence Dashboard. Tests rely on react-testing-library which the
 * root jest config already supports.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { SorobanBridgeIntelligenceDashboard } from './SorobanBridgeIntelligenceDashboard';
import { round, trendDirection } from './metrics';

describe('metrics helpers', () => {
  it('rounds to the requested precision', () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.235, 2)).toBe(1.24);
    expect(round(NaN, 2)).toBe(0);
  });

  it('returns flat when there are fewer than two trend points', () => {
    expect(trendDirection([]).direction).toBe('flat');
    expect(trendDirection([{ timestamp: 0, value: 1 }]).direction).toBe('flat');
  });

  it('detects up vs down trend correctly', () => {
    const points = [
      { timestamp: 0, value: 100 },
      { timestamp: 1, value: 110 },
    ];
    expect(trendDirection(points).direction).toBe('up');
    expect(
      trendDirection([
        { timestamp: 0, value: 110 },
        { timestamp: 1, value: 100 },
      ]).direction,
    ).toBe('down');
  });
});

describe('SorobanBridgeIntelligenceDashboard', () => {
  it('renders headline metrics from the default mock snapshot', () => {
    render(<SorobanBridgeIntelligenceDashboard />);

    // The headline card always renders the four metrics. Titles in CAPS.
    expect(screen.getByText(/Network Health/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Volume/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg Success Rate/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg Latency/i)).toBeInTheDocument();
  });

  it('renders all three metric groups', () => {
    render(<SorobanBridgeIntelligenceDashboard />);
    expect(screen.getByLabelText(/Route metrics/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Provider metrics/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Asset metrics/i)).toBeInTheDocument();
  });

  it('opens the drill-down panel when a route row is clicked', () => {
    render(<SorobanBridgeIntelligenceDashboard />);
    const button = screen.getByRole('button', {
      name: /Drill down on ETH/i,
    });
    fireEvent.click(button);
    expect(screen.getByTestId('drill-down-panel')).toBeInTheDocument();
  });

  it('fires the onDrillDown callback when a row is clicked', () => {
    const onDrillDown = jest.fn();
    render(
      <SorobanBridgeIntelligenceDashboard onDrillDown={onDrillDown} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Drill down on Squid/i }),
    );
    expect(onDrillDown).toHaveBeenCalledWith({
      kind: 'provider',
      id: 'squid',
    });
  });
});
