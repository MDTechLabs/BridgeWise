import { Module } from '@nestjs/common';
import { TransferStateMachineController } from './transfer-state-machine.controller';
import { TransferStateMachineService } from './transfer-state-machine.service';

@Module({
  controllers: [TransferStateMachineController],
  providers: [TransferStateMachineService],
  exports: [TransferStateMachineService],
})
export class TransferStateMachineModule {}
