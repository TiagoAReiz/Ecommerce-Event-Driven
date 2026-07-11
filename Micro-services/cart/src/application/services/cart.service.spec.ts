import { CartService } from './cart.service';
import { Cart } from '../../core/entities/cart.entity';
import { CartItem } from '../../core/entities/cart-item.entity';
import { CartItemAccessDeniedException } from '../../core/exceptions/cart-item-access-denied.exception';
import { CartItemNotFoundException } from '../../core/exceptions/cart-item-not-found.exception';
import { InvalidQuantityException } from '../../core/exceptions/invalid-quantity.exception';
import { VariantNotFoundException } from '../../core/exceptions/variant-not-found.exception';
import type { ICartRepository } from '../../core/interfaces/repositories/cart-repository.interface';
import type { ICatalogClient } from '../../core/interfaces/external/catalog-client.interface';

function buildCart(overrides: Partial<{ id: string; userId: string; items: CartItem[] }> = {}): Cart {
  return new Cart({
    id: overrides.id ?? 'cart-1',
    userId: overrides.userId ?? 'user-1',
    items: overrides.items ?? [],
    createdAt: new Date('2026-07-10T10:00:00Z'),
    updatedAt: new Date('2026-07-10T10:00:00Z'),
  });
}

function buildItem(overrides: Partial<{ id: string; cartId: string }> = {}): CartItem {
  return new CartItem({
    id: overrides.id ?? 'item-1',
    cartId: overrides.cartId ?? 'cart-1',
    variantId: 'variant-1',
    sellerId: 'seller-1',
    quantity: 2,
    unitPriceSnapshot: '49.90',
    createdAt: new Date('2026-07-10T10:00:00Z'),
    updatedAt: new Date('2026-07-10T10:00:00Z'),
  });
}

function buildService() {
  const cartRepository: jest.Mocked<ICartRepository> = {
    findByUserId: jest.fn(),
    findOrCreateByUserId: jest.fn(),
    upsertItem: jest.fn(),
    findItemById: jest.fn(),
    updateItemQuantity: jest.fn(),
    deleteItem: jest.fn(),
    clearItems: jest.fn(),
  };
  const catalogClient: jest.Mocked<ICatalogClient> = {
    getVariant: jest.fn(),
  };
  const service = new CartService(cartRepository, catalogClient);
  return { service, cartRepository, catalogClient };
}

describe('CartService', () => {
  describe('getOrCreateCart', () => {
    it('delegates to the atomic find-or-create on the repository', async () => {
      const { service, cartRepository } = buildService();
      const cart = buildCart();
      cartRepository.findOrCreateByUserId.mockResolvedValue(cart);

      const result = await service.getOrCreateCart('user-1');

      expect(cartRepository.findOrCreateByUserId).toHaveBeenCalledWith('user-1');
      expect(result).toBe(cart);
    });
  });

  describe('addItem', () => {
    it('rejects a non-positive quantity without calling the catalog', async () => {
      const { service, catalogClient } = buildService();

      await expect(service.addItem('user-1', 'variant-1', 0, 'token')).rejects.toThrow(
        InvalidQuantityException,
      );
      expect(catalogClient.getVariant).not.toHaveBeenCalled();
    });

    it('throws VariantNotFoundException when the catalog does not know the variant', async () => {
      const { service, catalogClient } = buildService();
      catalogClient.getVariant.mockResolvedValue(null);

      await expect(service.addItem('user-1', 'variant-1', 1, 'token')).rejects.toThrow(
        VariantNotFoundException,
      );
    });

    it('fetches the variant from the catalog (passing the JWT through) and upserts the item', async () => {
      const { service, cartRepository, catalogClient } = buildService();
      catalogClient.getVariant.mockResolvedValue({
        variantId: 'variant-1',
        sellerId: 'seller-1',
        price: '49.90',
      });
      const cart = buildCart();
      cartRepository.findOrCreateByUserId.mockResolvedValue(cart);

      const result = await service.addItem('user-1', 'variant-1', 2, 'jwt-token');

      expect(catalogClient.getVariant).toHaveBeenCalledWith('variant-1', 'jwt-token');
      expect(cartRepository.findOrCreateByUserId).toHaveBeenCalledWith('user-1');
      expect(cartRepository.upsertItem).toHaveBeenCalledWith('cart-1', {
        variantId: 'variant-1',
        sellerId: 'seller-1',
        quantity: 2,
        unitPriceSnapshot: '49.90',
      });
      expect(result).toBe(cart);
    });
  });

  describe('updateItemQuantity', () => {
    it('rejects a non-positive quantity', async () => {
      const { service, cartRepository } = buildService();

      await expect(service.updateItemQuantity('user-1', 'item-1', 0)).rejects.toThrow(
        InvalidQuantityException,
      );
      expect(cartRepository.findItemById).not.toHaveBeenCalled();
    });

    it('throws CartItemNotFoundException when the item does not exist', async () => {
      const { service, cartRepository } = buildService();
      cartRepository.findItemById.mockResolvedValue(null);

      await expect(service.updateItemQuantity('user-1', 'missing', 1)).rejects.toThrow(
        CartItemNotFoundException,
      );
    });

    it('throws CartItemAccessDeniedException when the item belongs to another user', async () => {
      const { service, cartRepository } = buildService();
      cartRepository.findItemById.mockResolvedValue({ item: buildItem(), cartUserId: 'other-user' });

      await expect(service.updateItemQuantity('user-1', 'item-1', 1)).rejects.toThrow(
        CartItemAccessDeniedException,
      );
      expect(cartRepository.updateItemQuantity).not.toHaveBeenCalled();
    });

    it('updates the quantity and returns the reloaded cart', async () => {
      const { service, cartRepository } = buildService();
      cartRepository.findItemById.mockResolvedValue({ item: buildItem(), cartUserId: 'user-1' });
      const reloaded = buildCart();
      cartRepository.findOrCreateByUserId.mockResolvedValue(reloaded);

      const result = await service.updateItemQuantity('user-1', 'item-1', 5);

      expect(cartRepository.updateItemQuantity).toHaveBeenCalledWith('item-1', 5);
      expect(result).toBe(reloaded);
    });
  });

  describe('removeItem', () => {
    it('throws CartItemNotFoundException when the item does not exist', async () => {
      const { service, cartRepository } = buildService();
      cartRepository.findItemById.mockResolvedValue(null);

      await expect(service.removeItem('user-1', 'missing')).rejects.toThrow(CartItemNotFoundException);
    });

    it('throws CartItemAccessDeniedException on ownership mismatch', async () => {
      const { service, cartRepository } = buildService();
      cartRepository.findItemById.mockResolvedValue({ item: buildItem(), cartUserId: 'other-user' });

      await expect(service.removeItem('user-1', 'item-1')).rejects.toThrow(CartItemAccessDeniedException);
      expect(cartRepository.deleteItem).not.toHaveBeenCalled();
    });

    it('deletes the item and returns the reloaded cart', async () => {
      const { service, cartRepository } = buildService();
      cartRepository.findItemById.mockResolvedValue({ item: buildItem(), cartUserId: 'user-1' });
      const reloaded = buildCart();
      cartRepository.findOrCreateByUserId.mockResolvedValue(reloaded);

      const result = await service.removeItem('user-1', 'item-1');

      expect(cartRepository.deleteItem).toHaveBeenCalledWith('item-1');
      expect(result).toBe(reloaded);
    });
  });

  describe('clearCart', () => {
    it('is a no-op when the user has no cart yet (idempotent)', async () => {
      const { service, cartRepository } = buildService();
      cartRepository.findByUserId.mockResolvedValue(null);

      await service.clearCart('user-1');

      expect(cartRepository.clearItems).not.toHaveBeenCalled();
    });

    it('clears the items of an existing cart', async () => {
      const { service, cartRepository } = buildService();
      cartRepository.findByUserId.mockResolvedValue(buildCart());

      await service.clearCart('user-1');

      expect(cartRepository.clearItems).toHaveBeenCalledWith('cart-1');
    });
  });
});
