import { BadRequestException } from '@nestjs/common';
import { OrdersController } from './orders.controller';

function build() {
  const orderService = {
    checkout: jest.fn(),
    listByUser: jest.fn(),
    getById: jest.fn(),
    cancel: jest.fn(),
    verifyPurchase: jest.fn(),
  };
  return { controller: new OrdersController(orderService as any), orderService };
}

function requestWith(userId: string, bearer = 'token-1') {
  return {
    user: { sub: userId },
    headers: { authorization: `Bearer ${bearer}` },
  } as any;
}

describe('OrdersController.verifyPurchase', () => {
  it('throws BadRequestException when productId query param is missing', async () => {
    const { controller } = build();

    await expect(
      controller.verifyPurchase(requestWith('user-1'), 'order-1', undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('delegates to OrderService.verifyPurchase with userId, orderId, productId and the bearer token', async () => {
    const { controller, orderService } = build();
    orderService.verifyPurchase.mockResolvedValue({ eligible: true, sellerId: 'seller-1' });

    const result = await controller.verifyPurchase(requestWith('user-1', 'token-1'), 'order-1', 'prod-1');

    expect(orderService.verifyPurchase).toHaveBeenCalledWith('user-1', 'order-1', 'prod-1', 'token-1');
    expect(result).toEqual({ eligible: true, sellerId: 'seller-1' });
  });
});
