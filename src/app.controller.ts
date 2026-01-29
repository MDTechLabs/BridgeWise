import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns a simple health check message indicating the API is operational',
  })
  @ApiResponse({
    status: 200,
    description: 'API is healthy and operational',
    example: 'Hello World!',
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
