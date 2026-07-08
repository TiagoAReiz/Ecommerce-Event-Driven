import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('catalog-db schema', () => {
  let prisma: PrismaService;
  const createdVariantIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdSellerIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.seller.deleteMany({ where: { id: { in: createdSellerIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates a Seller -> Category -> Product -> ProductVariant chain', async () => {
    const seller = await prisma.seller.create({
      data: {
        userId: randomUUID(),
        storeName: 'Loja Teste',
        slug: `loja-teste-${randomUUID()}`,
        document: '12345678900',
        mpCollectorId: 'mp-collector-123',
      },
    });
    createdSellerIds.push(seller.id);
    expect(seller.status).toBe('PENDING');

    const category = await prisma.category.create({
      data: { name: 'Eletrônicos', slug: `eletronicos-${randomUUID()}` },
    });
    createdCategoryIds.push(category.id);

    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        title: 'Fone de ouvido',
        description: 'Fone bluetooth',
      },
    });
    createdProductIds.push(product.id);
    expect(product.status).toBe('ACTIVE');

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SKU-${randomUUID()}`,
        attributes: { color: 'Preto' },
        price: '199.90',
        weightGrams: 250,
        heightCm: 5,
        widthCm: 10,
        lengthCm: 15,
      },
    });
    createdVariantIds.push(variant.id);
    expect(variant.price.toString()).toBe('199.9');

    const sellerWithProducts = await prisma.seller.findUniqueOrThrow({
      where: { id: seller.id },
      include: { products: true },
    });
    expect(sellerWithProducts.products).toHaveLength(1);
  });

  it('rejects a duplicate ProductVariant sku', async () => {
    const seller = await prisma.seller.create({
      data: {
        userId: randomUUID(),
        storeName: 'Loja Duplicada',
        slug: `loja-dup-${randomUUID()}`,
        document: '00000000000',
        mpCollectorId: 'mp-collector-dup',
      },
    });
    createdSellerIds.push(seller.id);

    const category = await prisma.category.create({
      data: { name: 'Moda', slug: `moda-${randomUUID()}` },
    });
    createdCategoryIds.push(category.id);

    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        title: 'Camiseta',
        description: 'Camiseta básica',
      },
    });
    createdProductIds.push(product.id);

    const sku = `SKU-${randomUUID()}`;
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku,
        attributes: { size: 'M' },
        price: '49.90',
        weightGrams: 150,
        heightCm: 2,
        widthCm: 20,
        lengthCm: 25,
      },
    });
    createdVariantIds.push(variant.id);

    await expect(
      prisma.productVariant.create({
        data: {
          productId: product.id,
          sku,
          attributes: { size: 'G' },
          price: '49.90',
          weightGrams: 160,
          heightCm: 2,
          widthCm: 20,
          lengthCm: 25,
        },
      }),
    ).rejects.toThrow();
  });

  it('creates an OutboxEvent with default status PENDING', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Product',
        aggregateId: randomUUID(),
        eventType: 'ProductCreated',
        payload: { title: 'Fone de ouvido' },
      },
    });
    createdOutboxIds.push(event.id);
    expect(event.status).toBe('PENDING');
  });
});
