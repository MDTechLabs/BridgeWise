const ROUTE_FEE_PERCENT = 0.005;

export function estimateRouteFee(amount: number): number {
    return amount * ROUTE_FEE_PERCENT;
}