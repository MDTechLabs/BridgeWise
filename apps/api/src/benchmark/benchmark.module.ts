// Simplified Benchmark Module for BridgeWise
// This is a placeholder implementation that will be enhanced when dependencies are properly configured

import { Module } from '@nestjs/common';
import { BenchmarkService } from './benchmark.service';
import { BenchmarkController } from './benchmark.controller';

@Module({
  providers: [BenchmarkService],
  controllers: [BenchmarkController],
  exports: [BenchmarkService],
})
export class BenchmarkModule {}

export { BenchmarkService, BenchmarkController };
