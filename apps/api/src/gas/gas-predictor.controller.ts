import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { GasPredictorService } from './gas-predictor.service';

@Controller('gas')
export class GasPredictorController {
    constructor(private readonly gasPredictorService: GasPredictorService) { }

    @Get('estimate')
    async estimate(@Query('chain') chain: string) {
        if (!chain) {
            throw new BadRequestException('Chain parameter is required');
        }
        return this.gasPredictorService.getGasEstimate(chain);
    }
}