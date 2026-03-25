import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgeBenchmark } from './entities/bridge-benchmark.entity';
import { BridgeBenchmarkService } from './bridge-benchmark.service';
import { BridgeBenchmarkController } from './bridge-benchmark.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BridgeBenchmark])],
  controllers: [BridgeBenchmarkController],
  providers: [BridgeBenchmarkService],
  exports: [BridgeBenchmarkService],
})
export class BridgeBenchmarkModule {}
