import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { LayerZeroService } from '../services/layerzero.service';
import {
  BridgeRoute,
  LayerZeroChainId,
  BridgeEstimate,
  FeeEstimate,
  LatencyEstimate,
  HealthStatus,
} from '../types/layerzero.type';

class EstimateDto {
  sourceChainId: LayerZeroChainId;
  destinationChainId: LayerZeroChainId;
  tokenAddress: string;
  payload: string;
}

@Controller('layerzero')
export class LayerZeroController {
  constructor(private readonly layerZeroService: LayerZeroService) {}

  /**
   * Get complete bridge estimate (fees + latency)
   * POST /layerzero/estimate
   */
  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  async getEstimate(@Body() dto: EstimateDto): Promise<BridgeEstimate> {
    this.validateEstimateDto(dto);

    const route: BridgeRoute = {
      sourceChainId: dto.sourceChainId,
      destinationChainId: dto.destinationChainId,
      tokenAddress: dto.tokenAddress,
    };

    return this.layerZeroService.getBridgeEstimate(route, dto.payload);
  }

  /**
   * Get fee estimate only
   * POST /layerzero/estimate/fees
   */
  @Post('estimate/fees')
  @HttpCode(HttpStatus.OK)
  async estimateFees(@Body() dto: EstimateDto): Promise<FeeEstimate> {
    this.validateEstimateDto(dto);

    const route: BridgeRoute = {
      sourceChainId: dto.sourceChainId,
      destinationChainId: dto.destinationChainId,
      tokenAddress: dto.tokenAddress,
    };

    return this.layerZeroService.estimateFees(route, dto.payload);
  }

  /**
   * Get latency estimate only
   * POST /layerzero/estimate/latency
   */
  @Post('estimate/latency')
  @HttpCode(HttpStatus.OK)
  async estimateLatency(@Body() dto: Omit<EstimateDto, 'payload'>): Promise<LatencyEstimate> {
    this.validateRouteDto(dto);

    const route: BridgeRoute = {
      sourceChainId: dto.sourceChainId,
      destinationChainId: dto.destinationChainId,
      tokenAddress: dto.tokenAddress,
    };

    return this.layerZeroService.estimateLatency(route);
  }

  /**
   * Health check for specific chain
   * GET /layerzero/health/:chainId
   */
  @Get('health/:chainId')
  async checkHealth(
    @Param('chainId', ParseIntPipe) chainId: number,
  ): Promise<HealthStatus> {
    if (!this.isValidChainId(chainId)) {
      throw new BadRequestException(`Invalid chain ID: ${chainId}`);
    }

    return this.layerZeroService.checkHealth(chainId as LayerZeroChainId);
  }

  /**
   * Health check for all chains
   * GET /layerzero/health
   */
  @Get('health')
  async checkAllHealth(): Promise<HealthStatus[]> {
    return this.layerZeroService.checkAllHealth();
  }

  /**
   * Get cached health status
   * GET /layerzero/status
   */
  @Get('status')
  getStatus(): HealthStatus[] {
    const status = this.layerZeroService.getHealthStatus();
    return Array.isArray(status) ? status : [status];
  }

  /**
   * Get cached health status for specific chain
   * GET /layerzero/status/:chainId
   */
  @Get('status/:chainId')
  getChainStatus(
    @Param('chainId', ParseIntPipe) chainId: number,
  ): HealthStatus {
    if (!this.isValidChainId(chainId)) {
      throw new BadRequestException(`Invalid chain ID: ${chainId}`);
    }

    const status = this.layerZeroService.getHealthStatus(chainId as LayerZeroChainId);
    if (!status) {
      throw new BadRequestException(`No health data available for chain ${chainId}`);
    }

    return status as HealthStatus;
  }

  /**
   * Private validation methods
   */

  private validateEstimateDto(dto: EstimateDto): void {
    if (!this.isValidChainId(dto.sourceChainId)) {
      throw new BadRequestException(`Invalid source chain ID: ${dto.sourceChainId}`);
    }

    if (!this.isValidChainId(dto.destinationChainId)) {
      throw new BadRequestException(`Invalid destination chain ID: ${dto.destinationChainId}`);
    }

    if (dto.sourceChainId === dto.destinationChainId) {
      throw new BadRequestException('Source and destination chains must be different');
    }

    if (!dto.tokenAddress || !dto.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new BadRequestException('Invalid token address');
    }

    if (!dto.payload || !dto.payload.startsWith('0x')) {
      throw new BadRequestException('Payload must be a hex string starting with 0x');
    }
  }

  private validateRouteDto(dto: Omit<EstimateDto, 'payload'>): void {
    if (!this.isValidChainId(dto.sourceChainId)) {
      throw new BadRequestException(`Invalid source chain ID: ${dto.sourceChainId}`);
    }

    if (!this.isValidChainId(dto.destinationChainId)) {
      throw new BadRequestException(`Invalid destination chain ID: ${dto.destinationChainId}`);
    }

    if (dto.sourceChainId === dto.destinationChainId) {
      throw new BadRequestException('Source and destination chains must be different');
    }

    if (!dto.tokenAddress || !dto.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new BadRequestException('Invalid token address');
    }
  }

  private isValidChainId(chainId: number): boolean {
    return Object.values(LayerZeroChainId).includes(chainId);
  }
}