import { StockItemRepository } from './stock-item.repository';
import { StockItem } from '../../../core/entities/stock-item.entity';

function prismaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stock-1',
    variantId: 'v-1',
    sellerId: 'seller-1',
    quantity: 10,
    reservedQty: 2,
    createdAt: new Date('2026-07-11T09:00:00.000Z'),
    updatedAt: new Date('2026-07-11T09:00:00.000Z'),
    ...overrides,
  };
}

function buildRepo() {
  const prisma = {
    stockItem: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  } as any;
  return { repo: new StockItemRepository(prisma), prisma };
}

describe('StockItemRepository', () => {
  it('findByVariantId maps the row to a StockItem entity', async () => {
    const { repo, prisma } = buildRepo();
    prisma.stockItem.findUnique.mockResolvedValue(prismaRow());

    const result = await repo.findByVariantId('v-1');

    expect(prisma.stockItem.findUnique).toHaveBeenCalledWith({ where: { variantId: 'v-1' } });
    expect(result).toBeInstanceOf(StockItem);
    expect(result!.available).toBe(8);
  });

  it('findByVariantId returns null when there is no row', async () => {
    const { repo, prisma } = buildRepo();
    prisma.stockItem.findUnique.mockResolvedValue(null);

    expect(await repo.findByVariantId('v-x')).toBeNull();
  });

  it('create inserts with the given variantId/sellerId/quantity', async () => {
    const { repo, prisma } = buildRepo();
    prisma.stockItem.create.mockResolvedValue(prismaRow({ reservedQty: 0 }));

    await repo.create({ variantId: 'v-1', sellerId: 'seller-1', quantity: 10 });

    expect(prisma.stockItem.create).toHaveBeenCalledWith({
      data: { variantId: 'v-1', sellerId: 'seller-1', quantity: 10 },
    });
  });

  it('updateQuantity sets quantity by variantId without touching reservedQty', async () => {
    const { repo, prisma } = buildRepo();
    prisma.stockItem.update.mockResolvedValue(prismaRow({ quantity: 25 }));

    await repo.updateQuantity('v-1', 25);

    expect(prisma.stockItem.update).toHaveBeenCalledWith({
      where: { variantId: 'v-1' },
      data: { quantity: 25 },
    });
  });
});
