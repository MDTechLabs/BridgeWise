import { Module } from '@nestjs/common';
import { TraceCorrelationController } from './trace-correlation.controller';
import { TraceCorrelationService } from './trace-correlation.service';

@Module({
  controllers: [TraceCorrelationController],
  providers: [TraceCorrelationService],
  exports: [TraceCorrelationService],
})
export class TraceCorrelationModule {}
