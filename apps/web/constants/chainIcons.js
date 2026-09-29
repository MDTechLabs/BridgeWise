/**
 * chainIcons.ts
 *
 * Central registry for supported blockchain metadata and icons.
 *
 * Add a new chain here and the rest of the application can consume it
 * through getChainMeta() or getAllSupportedChains().
 */

export interface ChainMeta {
  readonly id: number;
  readonly name: string;
  readonly symbol: string;
  readonly svg: string;
  readonly color: string;
}

type ChainRegistry = Readonly<Record<number, ChainMeta>>;

// -----------------------------------------------------------------------------
// SVG Icons
// -----------------------------------------------------------------------------

const ETHEREUM_SVG = `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="16" cy="16" r="16" fill="#627EEA"/>
  <path d="M16 5v8.87l7.5 3.35L16 5z" fill="#fff" fill-opacity=".6"/>
  <path d="M16 5L8.5 17.22l7.5-3.35V5z" fill="#fff"/>
  <path d="M16 21.97v5.02l7.5-10.37L16 21.97z" fill="#fff" fill-opacity=".6"/>
  <path d="M16 26.99v-5.02l-7.5-5.35L16 26.99z" fill="#fff"/>
  <path d="M16 20.57l7.5-4.35-7.5-3.35v7.7z" fill="#fff" fill-opacity=".2"/>
  <path d="M8.5 16.22l7.5 4.35v-7.7l-7.5 3.35z" fill="#fff" fill-opacity=".6"/>
</svg>
`.trim();

const BNB_SVG = `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="16" cy="16" r="16" fill="#F3BA2F"/>
  <path
    d="M12.12 13.54L16 9.67l3.89 3.88 2.26-2.26L16 5.15 9.86 11.28l2.26 2.26z
       M5.15 16l2.26-2.26L9.67 16l-2.26 2.26L5.15 16zm6.97 2.46L16 22.33l3.89-3.88
       2.26 2.25L16 26.85l-6.14-6.13 2.26-2.26z
       M22.33 16l2.26-2.26L26.85 16l-2.26 2.26L22.33 16zm-3.9 0L16 13.67 13.57 16
       16 18.43 18.43 16z"
    fill="#fff"
  />
</svg>
`.trim();

const POLYGON_SVG = `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="16" cy="16" r="16" fill="#8247E5"/>
  <path
    d="M20.5 12.5l-5.5-3.18-5.5 3.18v6.36l5.5 3.18 5.5-3.18V12.5zm-5.5 7.64
       l-3.5-2.02v-4.04l3.5-2.02 3.5 2.02v4.04l-3.5 2.02z"
    fill="#fff"
  />
  <path
    d="M22.5 9.18L16 5.5l-6.5 3.68v7.36L16 20.22l6.5-3.68V9.18z"
    fill="none"
    stroke="#fff"
    stroke-width="1.5"
  />
</svg>
`.trim();

const ARBITRUM_SVG = `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="16" cy="16" r="16" fill="#2D374B"/>
  <path
    d="M16 6L8 11v10l8 5 8-5V11L16 6zm0 2.31l6 3.46v6.92l-6 3.46-6-3.46v-6.92l6-3.46z"
    fill="#28A0F0"
  />
  <path d="M13 17.5l3-5 3 5H13z" fill="#fff"/>
</svg>
`.trim();

const OPTIMISM_SVG = `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="16" cy="16" r="16" fill="#FF0420"/>
  <path
    d="M11.5 19.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5
       c1.07 0 2.02.49 2.66 1.25L16 12.5c-1.05-1.21-2.6-1.97-4.33-1.97
       C8.54 10.53 6 13.07 6 16s2.54 5.47 5.67 5.47c1.73 0 3.28-.76
       4.33-1.97l-1.84-1.25A3.48 3.48 0 0111.5 19.5zm9-9C17.54 10.5
       15 13.07 15 16s2.54 5.5 5.5 5.5S26 18.93 26 16s-2.54-5.5-5.5-5.5zm0
       9c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5
       -1.57 3.5-3.5 3.5z"
    fill="#fff"
  />
</svg>
`.trim();

const AVALANCHE_SVG = `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="16" cy="16" r="16" fill="#E84142"/>
  <path
    d="M20.5 20h3.5l-6-10.4-2 3.47L18.5 17H15l-1.75-3.07L11.25 17H9l5-8.67
       1.25 2.17L17.5 7 24 18h-3.5zM8 20h4l-2-3.47L8 20z"
    fill="#fff"
  />
</svg>
`.trim();

const BASE_SVG = `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="16" cy="16" r="16" fill="#0052FF"/>
  <path
    d="M16 7C11.03 7 7 11.03 7 16s4.03 9 9 9c4.56 0 8.34-3.4 8.92-7.82H16v-2.36h11.93
       c.05.39.07.78.07 1.18 0 6.63-5.37 12-12 12S4 22.63 4 16 9.37 4 16 4c3.13 0
       5.98 1.2 8.12 3.16l-1.7 1.7A9.47 9.47 0 0016 7z"
    fill="#fff"
  />
</svg>
`.trim();

const SOLANA_SVG = `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <defs>
    <linearGradient
      id="solana-chain-gradient"
      x1="9"
      y1="9"
      x2="23"
      y2="23"
      gradientUnits="userSpaceOnUse"
    >
      <stop stop-color="#9945FF"/>
      <stop offset="1" stop-color="#14F195"/>
    </linearGradient>
  </defs>

  <circle cx="16" cy="16" r="16" fill="#9945FF"/>

  <path
    d="M9 20.5h14l-2.5 2.5H9l2.5-2.5z
       M9 15h14l-2.5 2.5H9L11.5 15z
       M23 9H9l2.5 2.5H23L20.5 9z"
    fill="url(#solana-chain-gradient)"
  />
</svg>
`.trim();

// -----------------------------------------------------------------------------
// Fallback
// -----------------------------------------------------------------------------

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const createUnknownSvg = (symbol: string): string => {
  const safeSymbol = escapeXml(symbol.slice(0, 3).toUpperCase());

  return `
<svg
  viewBox="0 0 32 32"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <circle cx="16" cy="16" r="16" fill="#374151"/>
  <text
    x="16"
    y="21"
    text-anchor="middle"
    font-size="10"
    font-family="monospace"
    font-weight="700"
    fill="#fff"
  >
    ${safeSymbol}
  </text>
</svg>
`.trim();
};

// -----------------------------------------------------------------------------
// Chain Registry
// -----------------------------------------------------------------------------

export const CHAIN_MAP: ChainRegistry = {
  1: {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    svg: ETHEREUM_SVG,
    color: "#627EEA",
  },

  10: {
    id: 10,
    name: "Optimism",
    symbol: "OP",
    svg: OPTIMISM_SVG,
    color: "#FF0420",
  },

  56: {
    id: 56,
    name: "BNB Chain",
    symbol: "BNB",
    svg: BNB_SVG,
    color: "#F3BA2F",
  },

  137: {
    id: 137,
    name: "Polygon",
    symbol: "POL",
    svg: POLYGON_SVG,
    color: "#8247E5",
  },

  8453: {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    svg: BASE_SVG,
    color: "#0052FF",
  },

  42161: {
    id: 42161,
    name: "Arbitrum One",
    symbol: "ETH",
    svg: ARBITRUM_SVG,
    color: "#28A0F0",
  },

  43114: {
    id: 43114,
    name: "Avalanche",
    symbol: "AVAX",
    svg: AVALANCHE_SVG,
    color: "#E84142",
  },

  1399811149: {
    id: 1399811149,
    name: "Solana",
    symbol: "SOL",
    svg: SOLANA_SVG,
    color: "#9945FF",
  },
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

const UNKNOWN_CHAIN_COLOR = "#374151";

export function getChainMeta(chainId: number): ChainMeta {
  const chain = CHAIN_MAP[chainId];

  if (chain) {
    return chain;
  }

  const unknownSymbol = "???";

  return {
    id: chainId,
    name: `Chain ${chainId}`,
    symbol: unknownSymbol,
    svg: createUnknownSvg(unknownSymbol),
    color: UNKNOWN_CHAIN_COLOR,
  };
}

export function getAllSupportedChains(): ChainMeta[] {
  return Object.values(CHAIN_MAP).sort((a, b) => a.id - b.id);
}