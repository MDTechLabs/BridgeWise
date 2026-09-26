import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SorobanTransferLifecycleEntity } from './entities/soroban-transfer-lifecycle.entity';
import { SorobanLifecycleService } from './soroban-lifecycle.service';
import { SorobanLifecycleController } from './soroban-lifecycle.controller';

/**
 * SorobanLifecycleModule
 *
 * Encapsulates Soroban transfer lifecycle analytics:
 * - Records per-stage transition events
 * - Computes stage durations and aggregate statistics
 * - Exposes REST endpoints for event ingestion and report retrieval
 * - Listens to `soroban.transfer.*` events from the application event bus
 *
 * Register in AppModule to activate.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SorobanTransferLifecycleEntity]),
  ],
  controllers: [SorobanLifecycleController],
  providers: [SorobanLifecycleService],
  exports: [SorobanLifecycleService],
})
export class SorobanLifecycleModule {}
