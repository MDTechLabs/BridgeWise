import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  KeyboardEvent,
} from 'react';
import { Token, isTokenSupportedOnChain } from '../../tokenValidation';

export interface ChainOption {
  chainId: number;
  name: string;
}

export interface TokenSelectorProps {
  tokens: Token[];
  value?: Token | null;
  onChange?: (token: Token) => void;
  chainId?: number | null;
  onChainChange?: (chainId: number | null) => void;
  availableChains?: ChainOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxResults?: number;
}

function normalize(str: string) {
  return str.toLowerCase().trim();
}

function scoreToken(token: Token, query: string): number {
  const q = normalize(query);
  const sym = normalize(token.symbol);
  const name = normalize(token.name);
  const addr = normalize(token.address);

  if (sym === q) return 100;
  if (sym.startsWith(q)) return 90;
  if (name.startsWith(q)) return 80;
  if (sym.includes(q)) return 70;
  if (name.includes(q)) return 60;
  if (addr.startsWith(q)) return 50;
  return 0;
}

function searchTokens(tokens: Token[], query: string, limit: number) {
  if (!query.trim()) return tokens.slice(0, limit);

  return tokens
    .map((token) => ({ token, score: scoreToken(token, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.token);
}

function TokenLogo({ token, size = 24 }: { token: Token; size?: number }) {
  const [error, setError] = useState(false);

  if (token.logoURI && !error) {
    return (
      <img
        src={token.logoURI}
        alt={token.symbol}
        width={size}
        height={size}
        style={{
          borderRadius: '50%',
          display: 'block',
          flexShrink: 0,
        }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#374151',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 700,
        color: '#e5e7eb',
        flexShrink: 0,
        fontFamily: 'monospace',
      }}
    >
      {token.symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function TokenSelector({
  tokens,
  value,
  onChange,
  chainId,
  onChainChange,
  availableChains = [],
  placeholder = 'Search token…',
  disabled = false,
  className = '',
  maxResults = 8,
}: TokenSelectorProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => searchTokens(tokens, debouncedQuery, maxResults),
    [tokens, debouncedQuery, maxResults]
  );

  const selectedChain = availableChains.find((chain) => chain.chainId === chainId);
  const validation = value ? isTokenSupportedOnChain(value, chainId) : { isValid: true, errors: [] };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => setActiveIndex(-1), [debouncedQuery, chainId]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectToken = useCallback(
    (token: Token) => {
      if (disabled || (chainId != null && token.chainId !== chainId)) return;
      onChange?.(token);
      setQuery('');
      setIsOpen(false);
      inputRef.current?.blur();
    },
    [onChange, disabled, chainId]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, results.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
          selectToken(results[activeIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | null;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const listId = 'bw-token-selector-listbox';

  return (
    <>
      <style>{`
        .bw-token-selector {
          width: 100%;
          max-width: 420px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .bw-token-selector__chain-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 10px;
          align-items: center;
        }
        .bw-token-selector__chain-label {
          font-size: 13px;
          color: #4b5563;
        }
        .bw-token-selector__chain-select {
          min-width: 180px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #d1d5db;
          background: #fff;
          color: #111827;
          appearance: none;
        }
        .bw-token-selector__trigger {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1.5px solid #d1d5db;
          background: #fff;
          cursor: text;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .bw-token-selector__trigger:focus-within {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.18);
        }
        .bw-token-selector__trigger--disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .bw-token-selector__selected {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .bw-token-selector__selected-symbol {
          font-weight: 700;
          color: #111827;
        }
        .bw-token-selector__input {
          border: none;
          outline: none;
          flex: 1;
          min-width: 0;
          font-size: 14px;
          color: #111827;
          background: transparent;
          font-family: inherit;
        }
        .bw-token-selector__input::placeholder {
          color: #9ca3af;
        }
        .bw-token-selector__input:disabled {
          cursor: not-allowed;
        }
        .bw-token-selector__clear {
          border: none;
          background: none;
          color: #9ca3af;
          cursor: pointer;
          font-size: 17px;
          padding: 0;
          line-height: 1;
        }
        .bw-token-selector__clear:hover {
          color: #374151;
        }
        .bw-token-selector__dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          z-index: 200;
          border: 1.5px solid #e5e7eb;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 16px 32px rgba(15,23,42,0.08);
          overflow: hidden;
          animation: bw-dropdown-in 0.12s ease;
        }
        @keyframes bw-dropdown-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .bw-token-selector__list {
          list-style: none;
          margin: 0;
          padding: 8px;
          max-height: 300px;
          overflow-y: auto;
        }
        .bw-token-selector__item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 10px 12px;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .bw-token-selector__item:hover,
        .bw-token-selector__item--active {
          background: #f8fafc;
        }
        .bw-token-selector__item--disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .bw-token-selector__item-text {
          min-width: 0;
          flex: 1;
        }
        .bw-token-selector__item-symbol {
          font-weight: 700;
          color: #111827;
        }
        .bw-token-selector__item-name {
          font-size: 12px;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bw-token-selector__item-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
          align-items: center;
        }
        .bw-token-selector__item-chain {
          padding: 2px 8px;
          font-size: 10px;
          border-radius: 999px;
          background: #eef2ff;
          color: #4338ca;
          white-space: nowrap;
        }
        .bw-token-selector__warning {
          margin-top: 10px;
          color: #b91c1c;
          font-size: 13px;
        }
        .bw-token-selector__empty {
          padding: 18px 12px;
          text-align: center;
          color: #6b7280;
          font-size: 13px;
        }
      `}</style>

      <div ref={containerRef} className={`bw-token-selector ${className}`.trim()}>
        {availableChains.length > 0 && (
          <div className="bw-token-selector__chain-row">
            <label htmlFor="bw-token-selector-chain" className="bw-token-selector__chain-label">
              Network
            </label>
            <select
              id="bw-token-selector-chain"
              className="bw-token-selector__chain-select"
              value={chainId ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                onChainChange?.(value ? Number(value) : null);
              }}
              disabled={disabled}
            >
              <option value="">All networks</option>
              {availableChains.map((chain) => (
                <option key={chain.chainId} value={chain.chainId}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div
          className={`bw-token-selector__trigger${disabled ? ' bw-token-selector__trigger--disabled' : ''}`}
          onClick={() => !disabled && inputRef.current?.focus()}
        >
          {value && (
            <span className="bw-token-selector__selected">
              <TokenLogo token={value} size={20} />
              <span className="bw-token-selector__selected-symbol">{value.symbol}</span>
            </span>
          )}
          <input
            ref={inputRef}
            className="bw-token-selector__input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={value ? 'Change token…' : placeholder}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={
              activeIndex >= 0 ? `bw-token-selector-item-${activeIndex}` : undefined
            }
          />
          {query && (
            <button
              className="bw-token-selector__clear"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              tabIndex={-1}
              type="button"
            >
              ×
            </button>
          )}
        </div>

        {!validation.isValid && (
          <div className="bw-token-selector__warning" role="alert">
            {validation.errors[0]}
          </div>
        )}

        {isOpen && (
          <div className="bw-token-selector__dropdown">
            <ul
              ref={listRef}
              id={listId}
              className="bw-token-selector__list"
              role="listbox"
              aria-label="Token suggestions"
            >
              {results.length === 0 ? (
                <li className="bw-token-selector__empty" role="option" aria-selected={false}>
                  No tokens found
                </li>
              ) : (
                results.map((token, index) => {
                  const chainInfo = availableChains.find((chain) => chain.chainId === token.chainId);
                  const chainName = chainInfo?.name ?? `Chain ${token.chainId}`;
                  const supported = chainId == null || token.chainId === chainId;
                  const isActive = index === activeIndex;

                  return (
                    <li
                      key={`${token.chainId}-${token.address}`}
                      id={`bw-token-selector-item-${index}`}
                      role="option"
                      aria-selected={value?.address === token.address && value?.chainId === token.chainId}
                      className={`bw-token-selector__item${isActive ? ' bw-token-selector__item--active' : ''}${
                        supported ? '' : ' bw-token-selector__item--disabled'
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectToken(token)}
                    >
                      <TokenLogo token={token} size={28} />
                      <div className="bw-token-selector__item-text">
                        <div className="bw-token-selector__item-symbol">{token.symbol}</div>
                        <div className="bw-token-selector__item-name">{token.name}</div>
                        <div className="bw-token-selector__item-meta">
                          <span className="bw-token-selector__item-chain">{chainName}</span>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
