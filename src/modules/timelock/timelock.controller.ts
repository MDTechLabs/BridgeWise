import { Controller, Post, Body } from '@nestjs/common';
import { TimelockService } from './timelock.service';
import { VetoTimelockDto } from './dto/timelock.dto';

@Controller('timelock')
export class TimelockController {
  constructor(private readonly timelockService: TimelockService) {}

  @Post('veto')
  vetoTransaction(@Body() dto: VetoTimelockDto) {
    const result = this.timelockService.vetoTransaction(dto);
    return {
      message: 'Transaction successfully vetoed',
      details: result,
    };
  }
}
