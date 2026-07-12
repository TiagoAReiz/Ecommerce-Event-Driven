import { BadRequestException } from '@nestjs/common';
import { CartController } from './cart.controller';
import { Cart } from '../../../core/entities/cart.entity';
import { CartItem } from '../../../core/entities/cart-item.entity';

function buildRequest(overrides: Record<string, any> = {}) {
  return {
    user: { sub: 'user-1', email: 'a@b.com', role: 'CUSTOMER' },
    headers: { authorization: 'Bearer jwt-token' },
    ...overrides,
  } as any;
}

function buildCart(items: CartItem[] = []): Cart {
  return new Cart({
    id: 'cart-1',
    userId: 'user-1',
    items,
    createdAt: new Date('2026-07-10T10:00:00Z'),
    updatedAt: new Date('2026-07-10T10:00:00Z'),
  });
}

describe('CartController', () => {
  it('GET /cart returns the mapped cart', async () => {
    const cartService = { getOrCreateCart: jest.fn().mockResolvedValue(buildCart()) } as any;
    const controller = new CartController(cartService);

    const result = await controller.getCart(buildRequest());

    expect(cartService.getOrCreateCart).toHaveBeenCalledWith('user-1');
    expect(result.id).toBe('cart-1');
    expect(result.items).toEqual([]);
  });

  describe('POST /cart/items', () => {
    it('rejects a missing variantId with 400', async () => {
      const cartService = { addItem: jest.fn() } as any;
      const controller = new CartController(cartService);

      await expect(
        controller.addItem(buildRequest(), { quantity: 1 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(cartService.addItem).not.toHaveBeenCalled();
    });

    it('rejects a missing quantity with 400', async () => {
      const cartService = { addItem: jest.fn() } as any;
      const controller = new CartController(cartService);

      await expect(
        controller.addItem(buildRequest(), { variantId: 'variant-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('extracts the bearer token and repasses it to the service', async () => {
      const cartService = { addItem: jest.fn().mockResolvedValue(buildCart()) } as any;
      const controller = new CartController(cartService);

      await controller.addItem(buildRequest(), { variantId: 'variant-1', quantity: 2 });

      expect(cartService.addItem).toHaveBeenCalledWith('user-1', 'variant-1', 2, 'jwt-token');
    });
  });

  describe('PATCH /cart/items/:id', () => {
    it('rejects a missing quantity with 400', async () => {
      const cartService = { updateItemQuantity: jest.fn() } as any;
      const controller = new CartController(cartService);

      await expect(controller.updateItem(buildRequest(), 'item-1', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('delegates to the service with the authenticated userId', async () => {
      const cartService = { updateItemQuantity: jest.fn().mockResolvedValue(buildCart()) } as any;
      const controller = new CartController(cartService);

      await controller.updateItem(buildRequest(), 'item-1', { quantity: 5 });

      expect(cartService.updateItemQuantity).toHaveBeenCalledWith('user-1', 'item-1', 5);
    });
  });

  describe('DELETE /cart/items/:id', () => {
    it('delegates to the service with the authenticated userId', async () => {
      const cartService = { removeItem: jest.fn().mockResolvedValue(buildCart()) } as any;
      const controller = new CartController(cartService);

      await controller.removeItem(buildRequest(), 'item-1');

      expect(cartService.removeItem).toHaveBeenCalledWith('user-1', 'item-1');
    });
  });

  describe('DELETE /cart', () => {
    it('clears the cart for the authenticated user', async () => {
      const cartService = { clearCart: jest.fn().mockResolvedValue(undefined) } as any;
      const controller = new CartController(cartService);

      await controller.clearCart(buildRequest());

      expect(cartService.clearCart).toHaveBeenCalledWith('user-1');
    });
  });
});
