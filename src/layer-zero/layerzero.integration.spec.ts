import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { LayerZeroModule } from '../src/layerzero.module';
import { LayerZeroService } from '../src/services/layerzero.service';
import { ConfigModule } from '@nestjs/config';
import { LayerZeroChainId } from '../src/types/layerzero.types';

describe('LayerZero Adapter Integration Tests', () => {
  let app: INestApplication;
  let layerZeroService: LayerZeroService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        LayerZeroModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    layerZeroService = moduleFixture.get<LayerZeroService>(LayerZeroService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /layerzero/estimate', () => {
    it('should return complete bridge estimate', async () => {
      const estimateDto = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        payload: '0x123456',
      };

      const response = await request(app.getHttpServer())
        .post('/layerzero/estimate')
        .send(estimateDto)
        .expect(200);

      expect(response.body).toHaveProperty('fee');
      expect(response.body).toHaveProperty('latency');
      expect(response.body).toHaveProperty('route');

      expect(response.body.fee).toHaveProperty('nativeFee');
      expect(response.body.fee).toHaveProperty('zroFee');
      expect(response.body.fee).toHaveProperty('totalFeeUsd');
      expect(response.body.fee).toHaveProperty('estimatedAt');

      expect(response.body.latency).toHaveProperty('estimatedSeconds');
      expect(response.body.latency).toHaveProperty('confidence');
      expect(response.body.latency).toHaveProperty('lastUpdated');

      expect(response.body.route.sourceChainId).toBe(estimateDto.sourceChainId);
      expect(response.body.route.destinationChainId).toBe(estimateDto.destinationChainId);
    });

    it('should reject invalid source chain ID', async () => {
      const estimateDto = {
        sourceChainId: 999,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        payload: '0x123456',
      };

      await request(app.getHttpServer())
        .post('/layerzero/estimate')
        .send(estimateDto)
        .expect(400);
    });

    it('should reject same source and destination chains', async () => {
      const estimateDto = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.ETHEREUM,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        payload: '0x123456',
      };

      await request(app.getHttpServer())
        .post('/layerzero/estimate')
        .send(estimateDto)
        .expect(400);
    });

    it('should reject invalid token address', async () => {
      const estimateDto = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: 'invalid-address',
        payload: '0x123456',
      };

      await request(app.getHttpServer())
        .post('/layerzero/estimate')
        .send(estimateDto)
        .expect(400);
    });

    it('should reject invalid payload format', async () => {
      const estimateDto = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        payload: 'not-hex',
      };

      await request(app.getHttpServer())
        .post('/layerzero/estimate')
        .send(estimateDto)
        .expect(400);
    });
  });

  describe('POST /layerzero/estimate/fees', () => {
    it('should return fee estimate only', async () => {
      const estimateDto = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.ARBITRUM,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        payload: '0xabcdef1234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/layerzero/estimate/fees')
        .send(estimateDto)
        .expect(200);

      expect(response.body).toHaveProperty('nativeFee');
      expect(response.body).toHaveProperty('zroFee');
      expect(response.body).toHaveProperty('totalFeeUsd');
      expect(response.body).toHaveProperty('estimatedAt');
      expect(response.body.zroFee).toBe('0');
    });

    it('should calculate fees based on payload size', async () => {
      const smallPayload = '0x1234';
      const largePayload = '0x' + '12'.repeat(1000);

      const smallDto = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        payload: smallPayload,
      };

      const largeDto = { ...smallDto, payload: largePayload };

      const smallResponse = await request(app.getHttpServer())
        .post('/layerzero/estimate/fees')
        .send(smallDto)
        .expect(200);

      const largeResponse = await request(app.getHttpServer())
        .post('/layerzero/estimate/fees')
        .send(largeDto)
        .expect(200);

      expect(BigInt(largeResponse.body.nativeFee)).toBeGreaterThan(
        BigInt(smallResponse.body.nativeFee),
      );
    });
  });

  describe('POST /layerzero/estimate/latency', () => {
    it('should return latency estimate only', async () => {
      const routeDto = {
        sourceChainId: LayerZeroChainId.POLYGON,
        destinationChainId: LayerZeroChainId.ETHEREUM,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/layerzero/estimate/latency')
        .send(routeDto)
        .expect(200);

      expect(response.body).toHaveProperty('estimatedSeconds');
      expect(response.body).toHaveProperty('confidence');
      expect(response.body).toHaveProperty('lastUpdated');
      expect(response.body.estimatedSeconds).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(response.body.confidence);
    });

    it('should cache latency estimates', async () => {
      const routeDto = {
        sourceChainId: LayerZeroChainId.AVALANCHE,
        destinationChainId: LayerZeroChainId.BSC,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const response1 = await request(app.getHttpServer())
        .post('/layerzero/estimate/latency')
        .send(routeDto)
        .expect(200);

      const response2 = await request(app.getHttpServer())
        .post('/layerzero/estimate/latency')
        .send(routeDto)
        .expect(200);

      expect(response1.body.lastUpdated).toBe(response2.body.lastUpdated);
    });
  });

  describe('GET /layerzero/health', () => {
    it('should return health status for all chains', async () => {
      const response = await request(app.getHttpServer())
        .get('/layerzero/health')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      response.body.forEach((status) => {
        expect(status).toHaveProperty('isHealthy');
        expect(status).toHaveProperty('endpoint');
        expect(status).toHaveProperty('chainId');
        expect(status).toHaveProperty('latency');
        expect(status).toHaveProperty('lastChecked');
      });
    });
  });

  describe('GET /layerzero/health/:chainId', () => {
    it('should return health status for specific chain', async () => {
      const response = await request(app.getHttpServer())
        .get(`/layerzero/health/${LayerZeroChainId.ETHEREUM}`)
        .expect(200);

      expect(response.body).toHaveProperty('isHealthy');
      expect(response.body).toHaveProperty('endpoint');
      expect(response.body).toHaveProperty('chainId');
      expect(response.body.chainId).toBe(LayerZeroChainId.ETHEREUM);
      expect(response.body).toHaveProperty('latency');
      expect(typeof response.body.latency).toBe('number');
    });

    it('should reject invalid chain ID', async () => {
      await request(app.getHttpServer())
        .get('/layerzero/health/999')
        .expect(400);
    });
  });

  describe('GET /layerzero/status', () => {
    it('should return cached health status for all chains', async () => {
      const response = await request(app.getHttpServer())
        .get('/layerzero/status')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /layerzero/status/:chainId', () => {
    it('should return cached health status for specific chain', async () => {
      const response = await request(app.getHttpServer())
        .get(`/layerzero/status/${LayerZeroChainId.POLYGON}`)
        .expect(200);

      expect(response.body).toHaveProperty('chainId');
      expect(response.body.chainId).toBe(LayerZeroChainId.POLYGON);
    });
  });

  describe('Service Layer Tests', () => {
    it('should estimate fees correctly', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ETHEREUM,
        destinationChainId: LayerZeroChainId.POLYGON,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const feeEstimate = await layerZeroService.estimateFees(route, '0x123456');

      expect(feeEstimate.nativeFee).toBeDefined();
      expect(feeEstimate.zroFee).toBe('0');
      expect(feeEstimate.totalFeeUsd).toBeGreaterThan(0);
      expect(feeEstimate.estimatedAt).toBeInstanceOf(Date);
    });

    it('should estimate latency correctly', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.ARBITRUM,
        destinationChainId: LayerZeroChainId.OPTIMISM,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const latencyEstimate = await layerZeroService.estimateLatency(route);

      expect(latencyEstimate.estimatedSeconds).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(latencyEstimate.confidence);
      expect(latencyEstimate.lastUpdated).toBeInstanceOf(Date);
    });

    it('should perform health checks', async () => {
      const healthStatus = await layerZeroService.checkHealth(LayerZeroChainId.ETHEREUM);

      expect(healthStatus.chainId).toBe(LayerZeroChainId.ETHEREUM);
      expect(typeof healthStatus.isHealthy).toBe('boolean');
      expect(healthStatus.endpoint).toBeDefined();
      expect(healthStatus.latency).toBeGreaterThanOrEqual(0);
      expect(healthStatus.lastChecked).toBeInstanceOf(Date);
    });

    it('should get complete bridge estimate', async () => {
      const route = {
        sourceChainId: LayerZeroChainId.FANTOM,
        destinationChainId: LayerZeroChainId.AVALANCHE,
        tokenAddress: '0x1234567890123456789012345678901234567890',
      };

      const estimate = await layerZeroService.getBridgeEstimate(route, '0xdeadbeef');

      expect(estimate.fee).toBeDefined();
      expect(estimate.latency).toBeDefined();
      expect(estimate.route).toEqual(route);
    });
  });
});