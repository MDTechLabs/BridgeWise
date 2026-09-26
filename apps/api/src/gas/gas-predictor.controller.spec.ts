import { Test, TestingModule } from '@nestjs/testing';
import { GasPredictorController } from './gas-predictor.controller';
import { GasPredictorService } from './gas-predictor.service';
import { BadRequestException } from '@nestjs/common';

describe('GasPredictorController', () => {
    let controller: GasPredictorController;
    let serviceMock: any;

    beforeEach(async () => {
        serviceMock = {
            getGasEstimate: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [GasPredictorController],
            providers: [{ provide: GasPredictorService, useValue: serviceMock }],
        }).compile();

        controller = module.get<GasPredictorController>(GasPredictorController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('should call service and return result', async () => {
        const result = { suggestedGas: '100' };
        serviceMock.getGasEstimate.mockResolvedValue(result);

        expect(await controller.estimate('optimism')).toBe(result);
        expect(serviceMock.getGasEstimate).toHaveBeenCalledWith('optimism');
    });

    it('should throw BadRequestException if chain is missing', async () => {
        await expect(controller.estimate('')).rejects.toThrow(BadRequestException);
    });
});
