import { BadRequestException } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockItem } from '../../../core/entities/stock-item.entity';

function buildController() {
  const stockService = {
    getByVariantId: jest.fn(),
    initStock: jest.fn(),
    updateStock: jest.fn(),
  } as any;
  const controller = new StockController(stockService);
  return { controller, stockService };
}

function stockItem(): StockItem {
  return new StockItem({
    id: 'stock-1',
    variantId: 'v-1',
    sellerId: 'seller-1',
    quantity: 10,
    reservedQty: 2,
    createdAt: new Date('2026-07-11T09:00:00.000Z'),
    updatedAt: new Date('2026-07-11T09:00:00.000Z'),
  });
}

function reqWithToken(token = 'the-token'): any {
  return { headers: { authorization: `Bearer ${token}` }, user: { sub: 'user-1' } };
}

describe('StockController', () => {
  it('GET /:variantId returns the public availability shape', async () => {
    const { controller, stockService } = buildController();
    stockService.getByVariantId.mockResolvedValue(stockItem());

    const result = await controller.getAvailability('v-1');

    expect(stockService.getByVariantId).toHaveBeenCalledWith('v-1');
    expect(result).toEqual({ variantId: 'v-1', available: 8, quantity: 10, reservedQty: 2 });
  });

  describe('POST / (initStock)', () => {
    it('forwards the bearer token and body to the service', async () => {
      const { controller, stockService } = buildController();
      stockService.initStock.mockResolvedValue(stockItem());

      const result = await controller.initStock(reqWithToken(), { variantId: 'v-1', quantity: 10 });

      expect(stockService.initStock).toHaveBeenCalledWith('the-token', {
        variantId: 'v-1',
        quantity: 10,
      });
      expect(result.sellerId).toBe('seller-1');
    });

    it('rejects a missing variantId with 400', async () => {
      const { controller } = buildController();

      await expect(
        controller.initStock(reqWithToken(), { quantity: 10 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-numeric quantity with 400', async () => {
      const { controller } = buildController();

      await expect(
        controller.initStock(reqWithToken(), { variantId: 'v-1', quantity: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('PATCH /:variantId (updateStock)', () => {
    it('forwards the bearer token, variantId and quantity to the service', async () => {
      const { controller, stockService } = buildController();
      stockService.updateStock.mockResolvedValue(stockItem());

      await controller.updateStock(reqWithToken(), 'v-1', { quantity: 25 });

      expect(stockService.updateStock).toHaveBeenCalledWith('the-token', 'v-1', { quantity: 25 });
    });

    it('rejects a missing quantity with 400', async () => {
      const { controller } = buildController();

      await expect(
        controller.updateStock(reqWithToken(), 'v-1', {} as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
