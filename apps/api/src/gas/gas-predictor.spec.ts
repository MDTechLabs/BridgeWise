import { Test, TestingModule } from '@nestjs/testing';
import { GasPredictorService } from './gas-predictor.service';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { getRedisToken } from '@nestjs-modules/ioredis';
import { ethers } from 'ethers';

jest.mock('ethers', () => {
    return {
        ethers: {
            JsonRpcProvider: jest.fn(),
        }
    };
});

describe('GasPredictorService', () => {
    let service: GasPredictorService;
    let redisMock: jest.Mocked<Redis>;
    let configMock: jest.Mocked<ConfigService>;
    let providerMock: any;

    beforeEach(async () => {
        redisMock = { get: jest.fn(), set: jest.fn() } as any;
        configMock = { get: jest.fn() } as any;
        
        providerMock = {
            getBlockNumber: jest.fn(),
            getBlock: jest.fn(),
            send: jest.fn(),
        };

        (ethers.JsonRpcProvider as jest.Mock).mockImplementation(() => providerMock);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GasPredictorService,
                { provide: getRedisToken('default'), useValue: redisMock },
                { provide: ConfigService, useValue: configMock },
            ],
        }).compile();

        service = module.get<GasPredictorService>(GasPredictorService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should return cached estimate if available', async () => {
        const cachedData = { baseFee: '100', suggestedGas: '115' };
        redisMock.get.mockResolvedValue(JSON.stringify(cachedData));

        const result = await service.getGasEstimate('optimism');
        expect(result).toMatchObject(cachedData);
        expect(redisMock.get).toHaveBeenCalledWith('gas:estimate:optimism');
    });

    it('should return Soroban gas estimate when chain is soroban', async () => {
        redisMock.get.mockResolvedValue(null);
        
        const result = await service.getGasEstimate('soroban');
        expect(result.baseFee).toBe('100000');
        expect(result.priorityFee).toBe('50000');
        expect(result.chain).toBe('soroban');
        expect(result.isVolatile).toBe(false);
        expect(result.buffer).toBe(1.0);
        expect(result.suggestedGas).toBe('400000');
        
        expect(redisMock.set).toHaveBeenCalled();
    });

    it('should calculate EVM gas with low volatility', async () => {
        redisMock.get.mockResolvedValue(null);
        configMock.get.mockReturnValue('http://rpc.optimism');
        
        providerMock.getBlockNumber.mockResolvedValue(100);
        
        // Mock 20 blocks with same base fee to ensure low volatility
        providerMock.getBlock.mockImplementation((blockNum: number) => {
            return Promise.resolve({ baseFeePerGas: '1000000000' });
        });
        
        providerMock.send.mockImplementation(() => {
            return Promise.resolve({ reward: [['500000000']] });
        });

        const result = await service.getGasEstimate('optimism');
        
        expect(result.baseFee).toBe('1000000000');
        expect(result.priorityFee).toBe('500000000');
        expect(result.isVolatile).toBe(false);
        expect(result.buffer).toBe(1.0);
        expect(result.suggestedGas).toBe('2000000000'); // 1B + 2*0.5B = 2B
    });

    it('should calculate EVM gas with high volatility and apply 1.15 buffer', async () => {
        redisMock.get.mockResolvedValue(null);
        configMock.get.mockReturnValue('http://rpc.optimism');
        
        providerMock.getBlockNumber.mockResolvedValue(100);
        
        // Mock 20 blocks with varying base fees to trigger volatility
        providerMock.getBlock.mockImplementation((blockNum: number) => {
            // Alternating base fee to cause high standard deviation
            const baseFee = blockNum % 2 === 0 ? '1000000000' : '2000000000';
            return Promise.resolve({ baseFeePerGas: baseFee });
        });
        
        providerMock.send.mockImplementation(() => {
            return Promise.resolve({ reward: [['500000000']] });
        });

        const result = await service.getGasEstimate('optimism');
        
        expect(result.isVolatile).toBe(true);
        expect(result.buffer).toBe(1.15);
        expect(result.chain).toBe('optimism');
        
        // Average base fee: 1.5B, Average priority: 0.5B
        // Total: 1.5B + 2*0.5B = 2.5B
        // Buffer: 1.15
        // Suggested: 2.5B * 1.15 = 2.875B
        expect(result.suggestedGas).toBe('2875000000');
    });

    it('should throw error if RPC URL is not configured', async () => {
        redisMock.get.mockResolvedValue(null);
        configMock.get.mockReturnValue(undefined);
        
        await expect(service.getGasEstimate('optimism')).rejects.toThrow('RPC URL not configured for chain: optimism');
    });
    
    it('should handle failed block fetches gracefully', async () => {
        redisMock.get.mockResolvedValue(null);
        configMock.get.mockReturnValue('http://rpc.optimism');
        
        providerMock.getBlockNumber.mockResolvedValue(100);
        
        // Fail some blocks
        providerMock.getBlock.mockImplementation((blockNum: number) => {
            if (blockNum % 2 === 0) {
                return Promise.reject(new Error('RPC Error'));
            }
            return Promise.resolve({ baseFeePerGas: '1000000000' });
        });
        
        providerMock.send.mockImplementation(() => {
            return Promise.resolve({ reward: [['500000000']] });
        });

        const result = await service.getGasEstimate('optimism');
        
        expect(result.baseFee).toBe('1000000000');
        expect(result.priorityFee).toBe('500000000');
    });
});