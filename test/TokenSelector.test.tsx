import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react-dom/test-utils';
import { TokenSelector } from '@bridgewise/ui-components';

describe('TokenSelector', () => {
  const TOKENS = [
    { address: '0xaaa', symbol: 'USDC', name: 'USD Coin', chainId: 1, decimals: 6 },
    { address: '0xbbb', symbol: 'WETH', name: 'Wrapped Ether', chainId: 1, decimals: 18 },
    { address: '0xccc', symbol: 'BNB', name: 'BNB Token', chainId: 56, decimals: 18 },
    { address: '0xddd', symbol: 'USDT', name: 'Tether USD', chainId: 56, decimals: 6 },
  ];

  const CHAINS = [
    { chainId: 1, name: 'Ethereum' },
    { chainId: 56, name: 'BNB Chain' },
  ];

  it('renders a token picker and chain selector', async () => {
    render(<TokenSelector tokens={TOKENS} availableChains={CHAINS} />);

    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.getByLabelText(/network/i)).toBeTruthy();
  });

  it('filters tokens when a chain is selected', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TokenSelector tokens={TOKENS} availableChains={CHAINS} onChainChange={() => {}} />);

    const chainSelect = screen.getByLabelText(/network/i);
    await user.selectOptions(chainSelect, '56');

    const input = screen.getByRole('combobox');
    await user.click(input);
    act(() => vi.advanceTimersByTime(250));

    expect(screen.getByText('BNB')).toBeTruthy();
    expect(screen.queryByText('USDC')).toBeNull();
  });

  it('calls onChange with the selected token', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(
      <TokenSelector
        tokens={TOKENS}
        availableChains={CHAINS}
        chainId={1}
        onChange={onChange}
      />
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    act(() => vi.advanceTimersByTime(250));

    const option = screen.getByText('USDC');
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'USDC' }));
  });

  it('shows validation when selected token does not match the selected chain', async () => {
    render(
      <TokenSelector
        tokens={TOKENS}
        availableChains={CHAINS}
        chainId={56}
        value={TOKENS[0]}
      />
    );

    expect(screen.getByText(/not available on chain 56/i)).toBeTruthy();
  });
});
