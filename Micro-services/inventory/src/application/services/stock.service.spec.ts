import { StockService } from './stock.service';
import { StockItem } from '../../core/entities/stock-item.entity';
import { StockItemNotFoundException } from '../../core/exceptions/stock-item-not-found.exception';
import { StockItemAlreadyExistsException } from '../../core/exceptions/stock-item-already-exists.exception';
import { ForbiddenStockActionException } from '../../core/exceptions/forbidden-stock-action.exception';
import { VariantNotFoundException } from '../../core/exceptions/variant-not-found.exception';
import { SellerNotActiveException } from '../../core/exceptions/seller-not-active.exception';
import { InvalidStockQuantityException } from '../../core/exceptions/invalid-stock-quantity.exception';

function buildService() {
  const stockItemRepository = {
    findByVariantId: jest.fn(),
    create: jest.fn(),
    updateQuantity: jest.fn(),
  } as any;
  const catalogClient = {
    getMySeller: jest.fn(),
    getVariant: jest.fn(),
  } as any;
  const service = new StockService(stockItemRepository, catalogClient);
  return { service, stockItemRepository, catalogClient };
}

function stockItem(overrides: Partial<ConstructorParameters<typeof StockItem>[0]> = {}): StockItem {
  return new StockItem({
    id: 'stock-1',
    variantId: 'v-1',
    sellerId: 'seller-1',
    quantity: 10,
    reservedQty: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('StockService', () => {
  describe('getByVariantId', () => {
    it('returns the StockItem when present (available derives from quantity - reservedQty)', async () => {
      const { service, stockItemRepository } = buildService();
      stockItemRepository.findByVariantId.mockResolvedValue(stockItem({ quantity: 10, reservedQty: 3 }));

      const result = await service.getByVariantId('v-1');

      expect(result.available).toBe(7);
    });

    it('throws StockItemNotFound when the variant has no tracked stock', async () => {
      const { service, stockItemRepository } = buildService();
      stockItemRepository.findByVariantId.mockResolvedValue(null);

      await expect(service.getByVariantId('v-x')).rejects.toBeInstanceOf(StockItemNotFoundException);
    });
  });

  describe('initStock', () => {
    it('creates the StockItem with sellerId = caller seller.id when the variant is owned', async () => {
      const { service, stockItemRepository, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-1', status: 'ACTIVE' });
      catalogClient.getVariant.mockResolvedValue({ variantId: 'v-1', sellerId: 'seller-1' });
      stockItemRepository.findByVariantId.mockResolvedValue(null);
      stockItemRepository.create.mockResolvedValue(stockItem());

      await service.initStock('token', { variantId: 'v-1', quantity: 10 });

      expect(catalogClient.getMySeller).toHaveBeenCalledWith('token');
      expect(catalogClient.getVariant).toHaveBeenCalledWith('v-1', 'token');
      expect(stockItemRepository.create).toHaveBeenCalledWith({
        variantId: 'v-1',
        sellerId: 'seller-1',
        quantity: 10,
      });
    });

    it('rejects when the user has no active seller (403)', async () => {
      const { service, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-1', status: 'SUSPENDED' });

      await expect(
        service.initStock('token', { variantId: 'v-1', quantity: 10 }),
      ).rejects.toBeInstanceOf(SellerNotActiveException);
    });

    it('rejects when the user has no seller at all (403)', async () => {
      const { service, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue(null);

      await expect(
        service.initStock('token', { variantId: 'v-1', quantity: 10 }),
      ).rejects.toBeInstanceOf(SellerNotActiveException);
    });

    it('returns 404 when the variant does not exist in catalog', async () => {
      const { service, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-1', status: 'ACTIVE' });
      catalogClient.getVariant.mockResolvedValue(null);

      await expect(
        service.initStock('token', { variantId: 'v-x', quantity: 10 }),
      ).rejects.toBeInstanceOf(VariantNotFoundException);
    });

    it('rejects when the variant belongs to another seller (403)', async () => {
      const { service, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-1', status: 'ACTIVE' });
      catalogClient.getVariant.mockResolvedValue({ variantId: 'v-1', sellerId: 'seller-2' });

      await expect(
        service.initStock('token', { variantId: 'v-1', quantity: 10 }),
      ).rejects.toBeInstanceOf(ForbiddenStockActionException);
    });

    it('rejects when a StockItem already exists for the variant (409)', async () => {
      const { service, stockItemRepository, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-1', status: 'ACTIVE' });
      catalogClient.getVariant.mockResolvedValue({ variantId: 'v-1', sellerId: 'seller-1' });
      stockItemRepository.findByVariantId.mockResolvedValue(stockItem());

      await expect(
        service.initStock('token', { variantId: 'v-1', quantity: 10 }),
      ).rejects.toBeInstanceOf(StockItemAlreadyExistsException);
    });

    it('rejects a negative or non-integer quantity (400) before any catalog call', async () => {
      const { service, catalogClient } = buildService();

      await expect(
        service.initStock('token', { variantId: 'v-1', quantity: -1 }),
      ).rejects.toBeInstanceOf(InvalidStockQuantityException);
      await expect(
        service.initStock('token', { variantId: 'v-1', quantity: 1.5 }),
      ).rejects.toBeInstanceOf(InvalidStockQuantityException);
      expect(catalogClient.getMySeller).not.toHaveBeenCalled();
    });
  });

  describe('updateStock', () => {
    it('updates quantity when the caller owns the StockItem (no second getVariant call)', async () => {
      const { service, stockItemRepository, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-1', status: 'ACTIVE' });
      stockItemRepository.findByVariantId.mockResolvedValue(stockItem({ reservedQty: 2 }));
      stockItemRepository.updateQuantity.mockResolvedValue(stockItem({ quantity: 20 }));

      await service.updateStock('token', 'v-1', { quantity: 20 });

      expect(stockItemRepository.updateQuantity).toHaveBeenCalledWith('v-1', 20);
      expect(catalogClient.getVariant).not.toHaveBeenCalled();
    });

    it('returns 404 when there is no StockItem for the variant', async () => {
      const { service, stockItemRepository, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-1', status: 'ACTIVE' });
      stockItemRepository.findByVariantId.mockResolvedValue(null);

      await expect(
        service.updateStock('token', 'v-1', { quantity: 20 }),
      ).rejects.toBeInstanceOf(StockItemNotFoundException);
    });

    it('rejects when the caller does not own the StockItem (403)', async () => {
      const { service, stockItemRepository, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-2', status: 'ACTIVE' });
      stockItemRepository.findByVariantId.mockResolvedValue(stockItem({ sellerId: 'seller-1' }));

      await expect(
        service.updateStock('token', 'v-1', { quantity: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenStockActionException);
    });

    it('rejects lowering quantity below the currently reserved amount (400)', async () => {
      const { service, stockItemRepository, catalogClient } = buildService();
      catalogClient.getMySeller.mockResolvedValue({ id: 'seller-1', status: 'ACTIVE' });
      stockItemRepository.findByVariantId.mockResolvedValue(stockItem({ reservedQty: 5 }));

      await expect(
        service.updateStock('token', 'v-1', { quantity: 3 }),
      ).rejects.toBeInstanceOf(InvalidStockQuantityException);
    });
  });
});
