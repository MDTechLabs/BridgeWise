// Simplified Benchmark Module for BridgeWise
// This is a placeholder implementation that will be enhanced when dependencies are properly configured

import { BenchmarkService } from './benchmark.service';
import { BenchmarkController } from './benchmark.controller';

export class BenchmarkModule {
  static forRoot() {
    return {
      providers: [BenchmarkService],
      controllers: [BenchmarkController],
      exports: [BenchmarkService],
    };
  }
}

export { BenchmarkService, BenchmarkController };
