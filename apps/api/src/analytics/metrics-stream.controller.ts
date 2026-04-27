import { Controller, Get, Sse, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { MetricsStreamService, MetricsUpdate } from './metrics-stream.service';

@ApiTags('Metrics Stream')
@Controller('metrics')
export class MetricsStreamController {
  constructor(private readonly metricsStreamService: MetricsStreamService) {}

  @Sse('stream')
  @ApiOperation({
    summary: 'Stream real-time metrics (Server-Sent Events)',
    description:
      'Establishes a real-time connection to receive live analytics metrics updates. Ideal for dashboards requiring real-time data.',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established. Events sent when metrics update.',
    content: {
      'text/event-stream': {
        schema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Update type: snapshot or incremental',
            },
            data: { type: 'object', description: 'Metrics data' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        example:
          'data: {"type":"incremental","data":{"totalTransactions":150,"successRate":95.5}}\n\n',
      },
    },
  })
  streamMetrics(): Observable<MessageEvent> {
    return new Observable((observer) => {
      const handler = (update: MetricsUpdate) => {
        observer.next({
          id: Date.now().toString(),
          data: update,
        });
      };

      const unsubscribe = this.metricsStreamService.subscribe(handler);

      return () => {
        unsubscribe();
      };
    });
  }

  @Get('current')
  @ApiOperation({
    summary: 'Get current metrics snapshot',
    description: 'Returns the current metrics snapshot without streaming.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current metrics retrieved',
  })
  getCurrentMetrics() {
    return this.metricsStreamService.getCurrentMetrics();
  }

  @Sse('route/:routeId/stream')
  @ApiOperation({
    summary: 'Stream metrics for specific route',
    description: 'Real-time metrics for a specific bridge route.',
  })
  streamRouteMetrics(
    @Param('routeId') routeId: string,
  ): Observable<MessageEvent> {
    // TODO: Implement route-specific streaming
    return new Observable((observer) => {
      observer.next({
        id: Date.now().toString(),
        data: {
          type: 'snapshot',
          data: { routeId, message: 'Route-specific streaming coming soon' },
          timestamp: new Date(),
        },
      });
      return () => {};
    });
  }
}
