import { Controller, Get, Post, Body, Query, HttpCode, Ok } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BalanceDriftClassifier } from './balance-drift.classifier';
import { BalanceSnapshot, DriftThresholds } from './balance-drift.classifier';
import { BalanceDriftRecord, DriftSeverity } from './balance-drift.entity';

class ClassifyDto implements BalanceSnapshot {
  chainId: string;
  contractAddress: string;
  asset: string;
  expectedBalance: string;
  observedBalance: string;
}

class ThresholdsDto implements DriftThresholds {
  warning: string;
  critical: string;
}

@ApiTags('balance-drift')
@Controller('balance-drift')
export class BalanceDriftController {
  constructor(private readonly classifier: BalanceDriftClassifier) {}

  @Post('classify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Classify balance drift and persist the record' })
  @ApiResponse({ status: 200, description: 'Classification result' })
  async classify(
    @Body() snapshot: ClassifyDto,
    @Body() thresholds?: ThresholdsDto,
  ) {
    return this.classifier.classifyAndRecord(snapshot, thresholds);
  }

  @Get('records')
  @HttpCode(200)
  @ApiOperation({ summary: 'List balance drift records' })
  @ApiResponse({ status: 200, description: 'List of drift records' })
  async getRecords(@Query('severity') severity?: DriftSeverity) {
    return this.classifier.getRecords(severity);
  }
}