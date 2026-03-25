"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_REGISTRY = void 0;
// Example registry (expand as needed)
exports.TOKEN_REGISTRY = [
    {
        symbol: 'USDC',
        name: 'USD Coin',
        chain: 'Ethereum',
        bridgeSupported: ['Stellar', 'Polygon'],
        decimals: 6,
        logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
    },
    {
        symbol: 'USDC',
        name: 'USD Coin',
        chain: 'Stellar',
        bridgeSupported: ['Ethereum'],
        decimals: 7,
        logoURI: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
    },
    // Add more tokens and chains as needed
];
//# sourceMappingURL=tokenRegistry.js.map