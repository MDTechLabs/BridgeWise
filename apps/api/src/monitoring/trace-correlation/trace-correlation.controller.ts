import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TraceCorrelationService } from './trace-correlation.service';
import { CorrelatedTrace } from './trace-correlation.types';

/**
 * Read-only lookup. Traces are written internally by services that handle a
 * transaction; there is intentionally no public write endpoint.
 */
@ApiTags('Trace Correlation')
@Controller('monitoring/traces')
export class TraceCorrelationController {
  constructor(private readonly traces: TraceCorrelationService) {}

  @Get(':identifier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up a correlated transaction trace',
    description:
      'Accepts a trace id or any linked identifier (request id, transaction id, quote id, tx hash) and returns the full cross-chain trace.',
  })
  @ApiParam({ name: 'identifier', example: '0xabc123' })
  @ApiResponse({ status: 200, description: 'Trace returned' })
  @ApiResponse({ status: 400, description: 'Malformed identifier' })
  @ApiResponse({ status: 404, description: 'No trace found for the identifier' })
  getTrace(@Param('identifier') identifier: string): CorrelatedTrace {
    const trace = this.traces.getTrace(identifier);
    if (!trace) throw new NotFoundException('No trace found for the given identifier');
    return trace;
  }
}
