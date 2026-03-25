"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useNetworkSwitcher = useNetworkSwitcher;
const react_1 = require("react");
const useWalletConnections_1 = require("../useWalletConnections");
function useNetworkSwitcher() {
    const { activeWallet } = (0, useWalletConnections_1.useWalletConnections)();
    const [currentNetwork, setCurrentNetwork] = (0, react_1.useState)(null);
    const [isSwitching, setIsSwitching] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const [supportedNetworks, setSupportedNetworks] = (0, react_1.useState)([]);
    (0, react_1.useEffect)(() => {
        if (activeWallet) {
            setCurrentNetwork(activeWallet.accounts[activeWallet.activeAccountIndex]?.chainId || null);
            setSupportedNetworks(activeWallet.wallet.supportedChains);
        }
        else {
            setCurrentNetwork(null);
            setSupportedNetworks([]);
        }
    }, [activeWallet]);
    const switchNetwork = (0, react_1.useCallback)(async (targetChain) => {
        setIsSwitching(true);
        setError(null);
        try {
            if (!activeWallet)
                throw { code: 'NOT_CONNECTED', message: 'No wallet connected' };
            if (!activeWallet.wallet.supportedChains.includes(targetChain)) {
                throw { code: 'NETWORK_NOT_SUPPORTED', message: 'Target chain not supported by wallet' };
            }
            await activeWallet.wallet.switchNetwork(targetChain);
            setCurrentNetwork(targetChain);
        }
        catch (err) {
            setError(err);
        }
        finally {
            setIsSwitching(false);
        }
    }, [activeWallet]);
    return {
        currentNetwork,
        switchNetwork,
        isSwitching,
        error,
        supportedNetworks,
    };
}
//# sourceMappingURL=useNetworkSwitcher.js.map