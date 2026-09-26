export interface SimulationResult {
    routeId: string;
    success: boolean;
    gasUsed: number;
    fee: string;
    durationMs: number;
}

export interface SimulationReport {
    summary: string;
    expectedFees: string;
    estimatedDuration: number;
}

export class SorobanSimulationReporter {
    public generateReport(results: SimulationResult[]): SimulationReport {
        // Summarize simulation results
        const successCount = results.filter(r => r.success).length;
        const totalFees = results.reduce((acc, r) => acc + Number(r.fee), 0);
        const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);

        return {
            summary: `Simulation complete. ${successCount} out of ${results.length} successful.`,
            expectedFees: totalFees.toString(),
            estimatedDuration: totalDuration,
        };
    }
}
