import { estimateRouteFee } from "./fees";
import { estimateNetworkFee } from "./network";

export function simulateTransferCost(request: SimulationRequest): CostForecast {
    const routeFee = estimateRouteFee(request.amount);

    const networkFee = estimateNetworkFee();

    return {
        transferAmount: request.amount,
        routeFee,
        networkFee,
        totalCost:
            request.amount +
            routeFee +
            networkFee,
    };
}