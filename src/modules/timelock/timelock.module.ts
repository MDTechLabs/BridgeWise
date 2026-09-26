import { Module } from '@nestjs/common';
import { TimelockService } from './timelock.service';
import { TimelockController } from './timelock.controller';

@Module({
  controllers: [TimelockController],
  providers: [TimelockService],
  exports: [TimelockService],
})
export class TimelockModule {}
