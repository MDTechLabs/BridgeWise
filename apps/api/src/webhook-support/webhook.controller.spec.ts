import { Test, TestingModule } from '@nestjs/testing';
import { Webhook } from '../entities/webhook.entity';
import { DeliveryStatus } from '../enums/delivery-status.enum';
import { WebhookEvent } from '../enums/webhook-event.enum';
import { WebhookController } from '../webhook.controller';
import { WebhookService } from '../webhook.service';

const mockWebhookService = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  ping: jest.fn(),
  dispatch: jest.fn(),
  listDeliveries: jest.fn(),
  getDelivery: jest.fn(),
  retryDelivery: jest.fn(),
});

const stubWebhook: Partial<Webhook> = {
  id: 'wh-uuid-1',
  name: 'Test Hook',
  url: 'https://example.com/hook',
  isActive: true,
};

describe('WebhookController', () => {
  let controller: WebhookController;
  let service: ReturnType<typeof mockWebhookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [{ provide: WebhookService, useFactory: mockWebhookService }],
    }).compile();

    controller = module.get(WebhookController);
    service = module.get(WebhookService);
  });

  afterEach(() => jest.clearAllMocks());

  it('create — delegates to service and returns result', async () => {
    service.create.mockResolvedValue(stubWebhook);
    const dto = {
      name: 'Test Hook',
      url: 'https://example.com/hook',
      secret: 'my-secret-key-16chars',
    };
    expect(await controller.create(dto)).toBe(stubWebhook);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('findAll — returns list from service', async () => {
    service.findAll.mockResolvedValue([stubWebhook]);
    expect(await controller.findAll()).toEqual([stubWebhook]);
  });

  it('findOne — passes id to service', async () => {
    service.findOne.mockResolvedValue(stubWebhook);
    expect(await controller.findOne('wh-uuid-1')).toBe(stubWebhook);
    expect(service.findOne).toHaveBeenCalledWith('wh-uuid-1');
  });

  it('update — merges dto and returns updated entity', async () => {
    const updated = { ...stubWebhook, name: 'Renamed' };
    service.update.mockResolvedValue(updated);
    const result = await controller.update('wh-uuid-1', { name: 'Renamed' });
    expect(result).toEqual(updated);
    expect(service.update).toHaveBeenCalledWith('wh-uuid-1', { name: 'Renamed' });
  });

  it('remove — calls service.remove', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.remove('wh-uuid-1');
    expect(service.remove).toHaveBeenCalledWith('wh-uuid-1');
  });

  it('ping — calls service.ping with id', async () => {
    service.ping.mockResolvedValue(undefined);
    await controller.ping('wh-uuid-1');
    expect(service.ping).toHaveBeenCalledWith('wh-uuid-1');
  });

  it('dispatch — passes dto to service', async () => {
    service.dispatch.mockResolvedValue(undefined);
    const dto = { event: WebhookEvent.GAS_SPIKE_DETECTED, data: { chain: 'eth' } };
    await controller.dispatch(dto);
    expect(service.dispatch).toHaveBeenCalledWith(dto);
  });

  it('listDeliveries — returns paginated result', async () => {
    const result = {
      items: [
        {
          id: 'del-1',
          webhookId: 'wh-uuid-1',
          event: WebhookEvent.PING,
          status: DeliveryStatus.SUCCESS,
        },
      ],
      total: 1,
    };
    service.listDeliveries.mockResolvedValue(result);

    const response = await controller.listDeliveries('wh-uuid-1', { page: 1, limit: 20 });

    expect(response).toEqual(result);
    expect(service.listDeliveries).toHaveBeenCalledWith('wh-uuid-1', { page: 1, limit: 20 });
  });

  it('getDelivery — returns single delivery record', async () => {
    const delivery = { id: 'del-1', status: DeliveryStatus.SUCCESS };
    service.getDelivery.mockResolvedValue(delivery);

    expect(await controller.getDelivery('wh-uuid-1', 'del-1')).toBe(delivery);
  });

  it('retryDelivery — delegates retry to service', async () => {
    service.retryDelivery.mockResolvedValue(undefined);
    await controller.retryDelivery('wh-uuid-1', 'del-1');
    expect(service.retryDelivery).toHaveBeenCalledWith('wh-uuid-1', 'del-1');
  });
});
