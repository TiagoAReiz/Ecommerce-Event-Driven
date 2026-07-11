import { Prisma } from '@prisma/client';
import { ProductRepository } from './product.repository';
import { Product } from '../../../core/entities/product.entity';
import { CategoryNotFoundException } from '../../../core/exceptions/category-not-found.exception';

const productRow = {
  id: 'product-1',
  sellerId: 'seller-1',
  categoryId: 'cat-1',
  title: 'Fone',
  description: 'Fone bluetooth',
  status: 'ACTIVE',
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
};

const variantRow = {
  id: 'variant-1',
  productId: 'product-1',
  sku: 'SKU-1',
  attributes: { color: 'Preto' },
  price: { toString: () => '199.9' },
  weightGrams: 250,
  heightCm: 5,
  widthCm: 10,
  lengthCm: 15,
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
};

function buildRepo() {
  const tx = { product: { create: jest.fn() }, outboxEvent: { create: jest.fn() } };
  const prisma = {
    product: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  return { repo: new ProductRepository(prisma), prisma, tx };
}

function p2003() {
  return new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
    code: 'P2003',
    clientVersion: '7.8.0',
  });
}

describe('ProductRepository', () => {
  it('maps a found row to a Product entity on findById', async () => {
    const { repo, prisma } = buildRepo();
    prisma.product.findUnique.mockResolvedValue(productRow);

    const product = await repo.findById('product-1');

    expect(product).toBeInstanceOf(Product);
  });

  it('returns product + mapped variants on findByIdWithVariants', async () => {
    const { repo, prisma } = buildRepo();
    prisma.product.findUnique.mockResolvedValue({ ...productRow, variants: [variantRow] });

    const result = await repo.findByIdWithVariants('product-1');

    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      include: { variants: true },
    });
    expect(result!.product).toBeInstanceOf(Product);
    expect(result!.variants).toHaveLength(1);
    expect(result!.variants[0].price).toBe(199.9);
  });

  it('returns null on findByIdWithVariants when the product does not exist', async () => {
    const { repo, prisma } = buildRepo();
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(repo.findByIdWithVariants('missing')).resolves.toBeNull();
  });

  describe('findMany', () => {
    it('applies categoryId/sellerId/status/query/price filters', async () => {
      const { repo, prisma } = buildRepo();
      prisma.product.findMany.mockResolvedValue([productRow]);

      await repo.findMany({
        categoryId: 'cat-1',
        sellerId: 'seller-1',
        status: 'ACTIVE',
        query: 'fone',
        minPrice: 100,
        maxPrice: 300,
        limit: 20,
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          categoryId: 'cat-1',
          sellerId: 'seller-1',
          status: 'ACTIVE',
          title: { contains: 'fone', mode: 'insensitive' },
          variants: { some: { price: { gte: 100, lte: 300 } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
    });

    it('returns nextCursor=null and no extra row when results fit within the limit', async () => {
      const { repo, prisma } = buildRepo();
      prisma.product.findMany.mockResolvedValue([productRow]);

      const result = await repo.findMany({ limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('drops the extra row and returns a decodable nextCursor when there are more pages', async () => {
      const { repo, prisma } = buildRepo();
      const rowA = { ...productRow, id: 'product-1' };
      const rowB = { ...productRow, id: 'product-2' };
      prisma.product.findMany.mockResolvedValue([rowA, rowB]);

      const result = await repo.findMany({ limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('product-1');
      expect(result.nextCursor).not.toBeNull();

      const decoded = JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString('utf8'));
      expect(decoded).toEqual({ createdAt: rowA.createdAt.toISOString(), id: 'product-1' });
    });

    it('decodes an incoming cursor into an OR (createdAt/id) where clause', async () => {
      const { repo, prisma } = buildRepo();
      prisma.product.findMany.mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({ createdAt: '2026-07-01T00:00:00.000Z', id: 'product-0' }),
      ).toString('base64url');

      await repo.findMany({ cursor, limit: 20 });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { createdAt: { lt: new Date('2026-07-01T00:00:00.000Z') } },
              { createdAt: new Date('2026-07-01T00:00:00.000Z'), id: { lt: 'product-0' } },
            ],
          },
        }),
      );
    });
  });

  it('creates the product and the outbox event inside the same transaction', async () => {
    const { repo, prisma, tx } = buildRepo();
    tx.product.create.mockResolvedValue(productRow);
    tx.outboxEvent.create.mockResolvedValue({});

    const product = await repo.createWithEvent(
      { id: 'product-1', sellerId: 'seller-1', categoryId: 'cat-1', title: 'Fone', description: 'desc' },
      { aggregateType: 'Product', aggregateId: 'product-1', eventType: 'ProductCreated', payload: {} },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(product).toBeInstanceOf(Product);
  });

  it('translates P2003 into CategoryNotFoundException on create', async () => {
    const { repo, tx } = buildRepo();
    tx.product.create.mockRejectedValue(p2003());

    await expect(
      repo.createWithEvent(
        { id: 'p', sellerId: 's', categoryId: 'missing-cat', title: 'X', description: 'Y' },
        { aggregateType: 'Product', aggregateId: 'p', eventType: 'ProductCreated', payload: {} },
      ),
    ).rejects.toThrow(CategoryNotFoundException);
  });

  it('translates P2003 into CategoryNotFoundException on update', async () => {
    const { repo, prisma } = buildRepo();
    prisma.product.update.mockRejectedValue(p2003());

    await expect(repo.update('product-1', { categoryId: 'missing-cat' })).rejects.toThrow(
      CategoryNotFoundException,
    );
  });

  it('sets status=DELETED on softDelete', async () => {
    const { repo, prisma } = buildRepo();
    prisma.product.update.mockResolvedValue({ ...productRow, status: 'DELETED' });

    await repo.softDelete('product-1');

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { status: 'DELETED' },
    });
  });
});
