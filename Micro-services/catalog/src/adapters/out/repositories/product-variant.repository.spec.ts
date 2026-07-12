import { Prisma } from '@prisma/client';
import { ProductVariantRepository } from './product-variant.repository';
import { ProductVariant } from '../../../core/entities/product-variant.entity';
import { DuplicateSkuException } from '../../../core/exceptions/duplicate-sku.exception';
import { ProductNotFoundException } from '../../../core/exceptions/product-not-found.exception';

const row = {
  id: 'variant-1',
  productId: 'product-1',
  sku: 'SKU-1',
  attributes: { color: 'Preto' },
  price: new Prisma.Decimal('199.9'),
  weightGrams: 250,
  heightCm: 5,
  widthCm: 10,
  lengthCm: 15,
  createdAt: new Date('2026-07-10T10:00:00Z'),
  updatedAt: new Date('2026-07-10T10:00:00Z'),
};

function buildRepo() {
  const tx = { productVariant: { update: jest.fn() }, outboxEvent: { create: jest.fn() } };
  const prisma = {
    productVariant: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  return { repo: new ProductVariantRepository(prisma), prisma, tx };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
  });
}

function p2003() {
  return new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
    code: 'P2003',
    clientVersion: '7.8.0',
  });
}

describe('ProductVariantRepository', () => {
  it('maps a found row to a ProductVariant entity on findById', async () => {
    const { repo, prisma } = buildRepo();
    prisma.productVariant.findUnique.mockResolvedValue(row);

    const variant = await repo.findById('variant-1');

    expect(variant).toBeInstanceOf(ProductVariant);
    expect(variant!.price).toBe(199.9);
  });

  describe('findDetailById', () => {
    it('joins the parent product and flattens sellerId/title/status with price as a string', async () => {
      const { repo, prisma } = buildRepo();
      prisma.productVariant.findUnique.mockResolvedValue({
        ...row,
        product: { sellerId: 'seller-1', title: 'Fone', status: 'ACTIVE' },
      });

      const detail = await repo.findDetailById('variant-1');

      expect(prisma.productVariant.findUnique).toHaveBeenCalledWith({
        where: { id: 'variant-1' },
        include: { product: true },
      });
      expect(detail).toEqual({
        variantId: 'variant-1',
        productId: 'product-1',
        sellerId: 'seller-1',
        title: 'Fone',
        sku: 'SKU-1',
        price: '199.90',
        weightGrams: 250,
        heightCm: 5,
        widthCm: 10,
        lengthCm: 15,
        status: 'ACTIVE',
      });
      expect(typeof detail!.price).toBe('string');
    });

    it('returns null when the variant does not exist', async () => {
      const { repo, prisma } = buildRepo();
      prisma.productVariant.findUnique.mockResolvedValue(null);

      await expect(repo.findDetailById('missing')).resolves.toBeNull();
    });
  });

  it('creates a variant, stringifying the price for Decimal precision', async () => {
    const { repo, prisma } = buildRepo();
    prisma.productVariant.create.mockResolvedValue(row);

    await repo.create({
      id: 'variant-1',
      productId: 'product-1',
      sku: 'SKU-1',
      attributes: { color: 'Preto' },
      price: 199.9,
      weightGrams: 250,
      heightCm: 5,
      widthCm: 10,
      lengthCm: 15,
    });

    expect(prisma.productVariant.create).toHaveBeenCalledWith({
      data: {
        id: 'variant-1',
        productId: 'product-1',
        sku: 'SKU-1',
        attributes: { color: 'Preto' },
        price: '199.9',
        weightGrams: 250,
        heightCm: 5,
        widthCm: 10,
        lengthCm: 15,
      },
    });
  });

  it('translates P2002 into DuplicateSkuException on create', async () => {
    const { repo, prisma } = buildRepo();
    prisma.productVariant.create.mockRejectedValue(p2002());

    await expect(
      repo.create({
        id: 'v',
        productId: 'p',
        sku: 'dup',
        attributes: {},
        price: 1,
        weightGrams: 1,
        heightCm: 1,
        widthCm: 1,
        lengthCm: 1,
      }),
    ).rejects.toThrow(DuplicateSkuException);
  });

  it('translates P2003 into ProductNotFoundException on create', async () => {
    const { repo, prisma } = buildRepo();
    prisma.productVariant.create.mockRejectedValue(p2003());

    await expect(
      repo.create({
        id: 'v',
        productId: 'missing-product',
        sku: 'SKU-1',
        attributes: {},
        price: 1,
        weightGrams: 1,
        heightCm: 1,
        widthCm: 1,
        lengthCm: 1,
      }),
    ).rejects.toThrow(ProductNotFoundException);
  });

  it('updates the variant without writing an outbox event when event=null', async () => {
    const { repo, prisma, tx } = buildRepo();
    tx.productVariant.update.mockResolvedValue({ ...row, sku: 'SKU-2' });

    const variant = await repo.updateWithOptionalEvent('variant-1', { sku: 'SKU-2' }, null);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { sku: 'SKU-2' },
    });
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(variant.sku).toBe('SKU-2');
  });

  it('updates the variant and writes the outbox event in the same transaction when price changed', async () => {
    const { repo, tx } = buildRepo();
    tx.productVariant.update.mockResolvedValue({ ...row, price: { toString: () => '249.9' } });
    tx.outboxEvent.create.mockResolvedValue({});

    const event = {
      aggregateType: 'ProductVariant',
      aggregateId: 'variant-1',
      eventType: 'ProductVariantPriceChanged',
      payload: { variantId: 'variant-1', productId: 'product-1', oldPrice: 199.9, newPrice: 249.9 },
    };

    const variant = await repo.updateWithOptionalEvent('variant-1', { price: 249.9 }, event);

    expect(tx.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { price: '249.9' },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: event });
    expect(variant.price).toBe(249.9);
  });

  it('translates P2002 into DuplicateSkuException on update', async () => {
    const { repo, tx } = buildRepo();
    tx.productVariant.update.mockRejectedValue(p2002());

    await expect(repo.updateWithOptionalEvent('variant-1', { sku: 'dup' }, null)).rejects.toThrow(
      DuplicateSkuException,
    );
  });
});
