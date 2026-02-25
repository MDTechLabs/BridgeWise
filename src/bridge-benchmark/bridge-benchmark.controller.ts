import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { BridgeBenchmarkService } from './bridge-benchmark.service';
import {
  InitiateBenchmarkDto,
  ConfirmBenchmarkDto,
  UpdateBenchmarkStatusDto,
  SpeedMetricsQueryDto,
  SpeedMetricsResponseDto,
} from './dto/bridge-benchmark.dto';
import { BridgeBenchmark } from './entities/bridge-benchmark.entity';

@ApiTags('Bridge Benchmarks')
@Controller('api/v1/bridges')
export class BridgeBenchmarkController {
  constructor(
    private readonly benchmarkService: BridgeBenchmarkService,
  ) {}

  @Post('benchmarks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate a bridge transaction benchmark',
    description:
      'Records the start of a bridge transaction lifecycle for speed tracking.',
  })
  @ApiResponse({ status: 201, description: 'Benchmark initiated', type: BridgeBenchmark })
  initiate(@Body() dto: InitiateBenchmarkDto): Promise<BridgeBenchmark> {
    return this.benchmarkService.initiate(dto);
  }

  @Patch('benchmarks/:id/confirm')
  @ApiOperation({
    summary: 'Confirm destination chain settlement',
    description:
      'Records the completion timestamp and calculates total settlement duration.',
  })
  @ApiParam({ name: 'id', description: 'Benchmark UUID' })
  @ApiResponse({ status: 200, description: 'Benchmark confirmed', type: BridgeBenchmark })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmBenchmarkDto,
  ): Promise<BridgeBenchmark> {
    return this.benchmarkService.confirm(id, dto);
  }

  @Patch('benchmarks/:id/status')
  @ApiOperation({
    summary: 'Update benchmark transaction status',
    description: 'Update the status (pending, submitted, confirmed, failed).',
  })
  @ApiParam({ name: 'id', description: 'Benchmark UUID' })
  @ApiResponse({ status: 200, description: 'Status updated', type: BridgeBenchmark })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBenchmarkStatusDto,
  ): Promise<BridgeBenchmark> {
    return this.benchmarkService.updateStatus(id, dto);
  }

  @Get('benchmarks/:id')
  @ApiOperation({ summary: 'Get a single benchmark record' })
  @ApiParam({ name: 'id', description: 'Benchmark UUID' })
  @ApiResponse({ status: 200, type: BridgeBenchmark })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BridgeBenchmark | null> {
    return this.benchmarkService.findOne(id);
  }

  @Get('speed-metrics')
  @ApiOperation({
    summary: 'Get bridge speed metrics',
    description:
      'Returns aggregated speed metrics per bridge/route including rolling averages for the last N transactions (default 50). Suitable for consumption by the ranking engine.',
  })
  @ApiResponse({
    status: 200,
    description: 'Speed metrics per bridge route',
    type: SpeedMetricsResponseDto,
  })
  getSpeedMetrics(
    @Query() query: SpeedMetricsQueryDto,
  ): Promise<SpeedMetricsResponseDto> {
    return this.benchmarkService.getSpeedMetrics(query);
  }
}
