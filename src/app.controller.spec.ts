import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigService } from './config/config.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                nodeEnv: 'test',
                server: { port: 3000 },
                database: { host: 'localhost', database: 'test', ssl: false },
                rpc: {},
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return environment and port info', () => {
      expect(appController.getHello()).toBe('BridgeWise is running in test mode on port 3000');
    });
  });
});
