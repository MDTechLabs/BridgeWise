"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBridgeRecommendation = useBridgeRecommendation;
const react_1 = require("react");
const bridge_recommendation_engine_1 = require("./bridge-recommendation.engine");
function useBridgeRecommendation(input) {
    const [result, setResult] = (0, react_1.useState)({
        rankedRoutes: [],
        errors: [],
    });
    (0, react_1.useEffect)(() => {
        if (input.routes && input.routes.length > 0) {
            setResult((0, bridge_recommendation_engine_1.recommendBridgeRoutes)(input));
        }
        else {
            setResult({ rankedRoutes: [], errors: ['No bridge routes available'] });
        }
    }, [input]);
    return result;
}
//# sourceMappingURL=useBridgeRecommendation.js.map