import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('PATCH /variants/:id (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let categoryId: string;
  let ownerToken: string;
  let ownerSellerId: string;
  let otherToken: string;
  let productId: string;

  const createdVariantIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdSellerIds: string[] = [];

  function signToken(sub: string): Promise<string> {
    return jwtService.signAsync(
      { sub, email: `${sub}@example.com`, role: 'CUSTOMER' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = new JwtService();

    const category = await prisma.category.create({
      data: { name: `Categoria Variants ${randomUUID()}`, slug: `categoria-variants-${randomUUID()}` },
    });
    categoryId = category.id;

    ownerToken = await signToken(`owner-${randomUUID()}`);
    const ownerSeller = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ storeName: 'Loja Variants', document: randomUUID(), mpCollectorId: 'mp-owner-v' })
      .expect(201);
    ownerSellerId = ownerSeller.body.id;
    createdSellerIds.push(ownerSellerId);

    otherToken = await signToken(`other-${randomUUID()}`);
    const otherSeller = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ storeName: 'Loja Variants Outro', document: randomUUID(), mpCollectorId: 'mp-other-v' })
      .expect(201);
    createdSellerIds.push(otherSeller.body.id);

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ categoryId, title: 'Produto Variants', description: 'desc' })
      .expect(201);
    productId = product.body.id;
    createdProductIds.push(productId);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...createdVariantIds, ...createdProductIds, ...createdSellerIds] } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.seller.deleteMany({ where: { id: { in: createdSellerIds } } });
    await prisma.category.delete({ where: { id: categoryId } });
    await app.close();
  });

  async function createVariant(price = 100) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/variants`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sku: `SKU-${randomUUID()}`,
        attributes: {},
        price,
        weightGrams: 100,
        heightCm: 1,
        widthCm: 1,
        lengthCm: 1,
      })
      .expect(201);
    createdVariantIds.push(response.body.id);
    return response.body;
  }

  it('publishes ProductVariantPriceChanged when the price changes', async () => {
    const variant = await createVariant(100);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/variants/${variant.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ price: 150.5 })
      .expect(200);

    expect(response.body.price).toBe(150.5);

    const events = await prisma.outboxEvent.findMany({
      where: { eventType: 'ProductVariantPriceChanged', aggregateId: variant.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      variantId: variant.id,
      productId,
      oldPrice: 100,
      newPrice: 150.5,
    });
  });

  it('does not publish a price-change event when only non-price fields change', async () => {
    const variant = await createVariant(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/variants/${variant.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ attributes: { color: 'Azul' } })
      .expect(200);

    const events = await prisma.outboxEvent.findMany({
      where: { eventType: 'ProductVariantPriceChanged', aggregateId: variant.id },
    });
    expect(events).toHaveLength(0);
  });

  it('does not publish a price-change event when the price is resubmitted unchanged', async () => {
    const variant = await createVariant(300);

    await request(app.getHttpServer())
      .patch(`/api/v1/variants/${variant.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ price: 300 })
      .expect(200);

    const events = await prisma.outboxEvent.findMany({
      where: { eventType: 'ProductVariantPriceChanged', aggregateId: variant.id },
    });
    expect(events).toHaveLength(0);
  });

  it('rejects an update from a non-owner with 403', async () => {
    const variant = await createVariant(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/variants/${variant.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ price: 999 })
      .expect(403);
  });

  it('returns 404 for an unknown variant id', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/variants/${randomUUID()}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ price: 999 })
      .expect(404);
  });

  describe('GET /variants/:id (public detail)', () => {
    it('returns the flattened variant+product detail with price as a string, no auth required', async () => {
      const variant = await createVariant(59.9);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/variants/${variant.id}`)
        .expect(200);

      expect(response.body).toEqual({
        variantId: variant.id,
        productId,
        sellerId: ownerSellerId,
        title: 'Produto Variants',
        sku: variant.sku,
        price: '59.90',
        weightGrams: 100,
        heightCm: 1,
        widthCm: 1,
        lengthCm: 1,
        status: 'ACTIVE',
      });
      expect(typeof response.body.price).toBe('string');
    });

    it('returns 404 for an unknown variant id', async () => {
      await request(app.getHttpServer()).get(`/api/v1/variants/${randomUUID()}`).expect(404);
    });
  });
});
