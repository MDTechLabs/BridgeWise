import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransactionTimeline } from './TransactionTimeline';
import { TimelineStage, getBlockExplorerUrl } from './TransactionTimeline.types';

describe('TransactionTimeline', () => {
  const mockStages: TimelineStage[] = [
    {
      id: 'SOURCE_APPROVAL',
      title: 'Source Approval',
      description: 'Approve token allowance on source chain',
      status: 'completed',
      explorerLink: {
        txHash: '0x1234567890abcdef1234567890abcdef12345678',
        chain: 'evm',
      },
    },
    {
      id: 'SOURCE_BURN_LOCK',
      title: 'Source Burn/Lock',
      description: 'Lock or burn tokens on source network',
      status: 'completed',
      explorerLink: {
        txHash: '9876543210fedcba9876543210fedcba98765432',
        chain: 'stellar',
      },
    },
    {
      id: 'RELAYER_RELAY',
      title: 'Relayer Relay',
      description: 'Cross-chain relayer routing message',
      status: 'active',
    },
    {
      id: 'DESTINATION_MINT_CLAIM',
      title: 'Destination Mint/Claim',
      description: 'Mint or claim tokens on destination chain',
      status: 'pending',
    },
  ];

  it('renders all 4 bridge stages with correct titles and descriptions', () => {
    render(<TransactionTimeline stages={mockStages} />);

    expect(screen.getByText('Source Approval')).toBeInTheDocument();
    expect(screen.getByText('Source Burn/Lock')).toBeInTheDocument();
    expect(screen.getByText('Relayer Relay')).toBeInTheDocument();
    expect(screen.getByText('Destination Mint/Claim')).toBeInTheDocument();
  });

  it('renders valid block explorer links for EVM (Etherscan) and Stellar (StellarExpert)', () => {
    render(<TransactionTimeline stages={mockStages} />);

    const etherscanLink = screen.getByText(/Etherscan/i);
    expect(etherscanLink).toBeInTheDocument();
    expect(etherscanLink.closest('a')).toHaveAttribute(
      'href',
      'https://etherscan.io/tx/0x1234567890abcdef1234567890abcdef12345678'
    );

    const stellarLink = screen.getByText(/StellarExpert/i);
    expect(stellarLink).toBeInTheDocument();
    expect(stellarLink.closest('a')).toHaveAttribute(
      'href',
      'https://stellarexpert.io/public/mainnet/tx/9876543210fedcba9876543210fedcba98765432'
    );
  });

  it('correctly generates block explorer URLs via getBlockExplorerUrl helper', () => {
    expect(getBlockExplorerUrl('0xabc', 'evm')).toBe('https://etherscan.io/tx/0xabc');
    expect(getBlockExplorerUrl('0xabc', 'stellar')).toBe('https://stellarexpert.io/public/mainnet/tx/0xabc');
    expect(getBlockExplorerUrl('0xabc', 'evm', 'https://custom.explorer/tx/{txHash}')).toBe(
      'https://custom.explorer/tx/0xabc'
    );
  });

  it('renders active stage with aria-current="step" for accessibility', () => {
    render(<TransactionTimeline stages={mockStages} />);

    const activeItem = screen.getByText('Relayer Relay').closest('li');
    expect(activeItem).toHaveAttribute('aria-current', 'step');
  });

  it('renders error state correctly when a stage fails', () => {
    const errorStages: TimelineStage[] = [
      ...mockStages.slice(0, 2),
      {
        id: 'RELAYER_RELAY',
        title: 'Relayer Relay',
        status: 'error',
        error: 'Relayer timeout: message delivery failed',
      },
      mockStages[3],
    ];

    render(<TransactionTimeline stages={errorStages} />);

    expect(screen.getByText('Relayer timeout: message delivery failed')).toBeInTheDocument();
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('supports light and dark theme mode props', () => {
    const { container: lightContainer } = render(<TransactionTimeline stages={mockStages} theme="light" />);
    expect(lightContainer.firstChild).toHaveClass('bg-white');

    const { container: darkContainer } = render(<TransactionTimeline stages={mockStages} theme="dark" />);
    expect(darkContainer.firstChild).toHaveClass('bg-slate-900');
  });
});
