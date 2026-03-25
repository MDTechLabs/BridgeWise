"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSlippageAlert = void 0;
const react_1 = require("react");
const useSlippageAlert = ({ token, sourceChain, destinationChain, maxSlippagePercent, }) => {
    const [slippage, setSlippage] = (0, react_1.useState)(0);
    const [errors, setErrors] = (0, react_1.useState)([]);
    (0, react_1.useEffect)(() => {
        const fetchSlippage = async () => {
            try {
                // Simulate API call to fetch slippage data
                const response = await fetch(`/api/slippage?token=${token}&sourceChain=${sourceChain}&destinationChain=${destinationChain}`);
                const data = await response.json();
                setSlippage(data.slippage);
            }
            catch (error) {
                setErrors((prev) => [...prev, "Failed to fetch slippage data"]);
            }
        };
        fetchSlippage();
    }, [token, sourceChain, destinationChain]);
    const exceeded = slippage > maxSlippagePercent;
    return {
        slippage,
        threshold: maxSlippagePercent,
        exceeded,
        errors,
    };
};
exports.useSlippageAlert = useSlippageAlert;
//# sourceMappingURL=useSlippageAlert.js.map