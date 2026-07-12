import { BadRequestException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { MercadoPagoWebhookBody } from '../../../core/interfaces/services/payment-webhook-service.interface';

function build() {
  const queryService = { getByOrderId: jest.fn(), getSplitsForUser: jest.fn() };
  const webhookService = { handleWebhook: jest.fn() };
  const controller = new PaymentsController(queryService as any, webhookService as any);
  return { controller, queryService, webhookService };
}

const reqWith = (sub: string) => ({ user: { sub } }) as any;

describe('PaymentsController', () => {
  it('getSplits returns the caller seller splits wrapped in an items list', async () => {
    const { controller, queryService } = build();
    queryService.getSplitsForUser.mockResolvedValue([
      {
        id: 's1',
        paymentId: 'pay-1',
        orderId: 'order-1',
        subOrderId: 'sub-1',
        sellerId: 'seller-1',
        amount: '110.00',
        platformFeeAmount: '10.00',
        status: 'SETTLED',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await controller.getSplits(reqWith('user-1'));

    expect(queryService.getSplitsForUser).toHaveBeenCalledWith('user-1');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].orderId).toBe('order-1');
  });

  it('getByOrderId delegates to the query service with the token subject', async () => {
    const { controller, queryService } = build();
    queryService.getByOrderId.mockResolvedValue({
      payment: {
        id: 'pay-1',
        orderId: 'order-1',
        userId: 'user-1',
        method: 'PIX',
        status: 'PENDING',
        totalAmount: '130.00',
        splits: [],
      },
      initPoint: 'http://x',
    });

    const res = await controller.getByOrderId(reqWith('user-1'), 'order-1');

    expect(queryService.getByOrderId).toHaveBeenCalledWith('user-1', 'order-1');
    expect(res.initPoint).toBe('http://x');
  });

  it('webhook validates the body shape and passes rawBody + signature through', async () => {
    const { controller, webhookService } = build();
    webhookService.handleWebhook.mockResolvedValue({ status: 'confirmed' });
    const body: MercadoPagoWebhookBody = {
      id: 'mp-evt-1',
      type: 'payment',
      data: { id: 'mp-pay-1' },
      orderId: 'order-1',
      status: 'approved',
    };
    const req: any = { rawBody: Buffer.from('RAW') };

    const res = await controller.webhook(req, 'sig-header', body);

    expect(res).toEqual({ status: 'confirmed' });
    expect(webhookService.handleWebhook).toHaveBeenCalledWith('RAW', 'sig-header', body);
  });

  it('webhook rejects a malformed body with 400', async () => {
    const { controller } = build();
    const req: any = { rawBody: Buffer.from('{}') };
    await expect(controller.webhook(req, 'sig', {} as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
