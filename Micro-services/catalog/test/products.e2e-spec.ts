import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let categoryId: string;
  let ownerToken: string;
  let ownerSellerId: string;
  let otherToken: string;

  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
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
      data: { name: `Categoria Produtos ${randomUUID()}`, slug: `categoria-produtos-${randomUUID()}` },
    });
    categoryId = category.id;

    ownerToken = await signToken(`owner-${randomUUID()}`);
    const ownerSeller = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ storeName: 'Loja Dono', document: randomUUID(), mpCollectorId: 'mp-owner' })
      .expect(201);
    ownerSellerId = ownerSeller.body.id;
    createdSellerIds.push(ownerSellerId);

    otherToken = await signToken(`other-${randomUUID()}`);
    const otherSeller = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ storeName: 'Loja Outro', document: randomUUID(), mpCollectorId: 'mp-other' })
      .expect(201);
    createdSellerIds.push(otherSeller.body.id);
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

  async function createProduct(token: string, overrides: Partial<{ title: string }> = {}) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId,
        title: overrides.title ?? `Produto ${randomUUID()}`,
        description: 'Descricao do produto e2e',
      })
      .expect(201);
    createdProductIds.push(response.body.id);
    return response.body;
  }

  it('creates a product and writes a ProductCreated outbox event', async () => {
    const product = await createProduct(ownerToken);

    expect(product.sellerId).toBe(ownerSellerId);
    expect(product.status).toBe('ACTIVE');

    const events = await prisma.outboxEvent.findMany({
      where: { eventType: 'ProductCreated', aggregateId: product.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      productId: product.id,
      sellerId: ownerSellerId,
      categoryId,
      status: 'ACTIVE',
    });
  });

  it('returns 404 for an unknown categoryId on create', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ categoryId: randomUUID(), title: 'X', description: 'Y' })
      .expect(404);
  });

  it('returns 404 on create when the caller has not onboarded as a seller', async () => {
    const token = await signToken(`no-seller-${randomUUID()}`);
    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId, title: 'X', description: 'Y' })
      .expect(404);
  });

  it('returns the product detail with an empty variants array right after creation', async () => {
    const product = await createProduct(ownerToken);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.id}`)
      .expect(200);

    expect(response.body.variants).toEqual([]);
  });

  it('returns 404 for an unknown product id', async () => {
    await request(app.getHttpServer()).get(`/api/v1/products/${randomUUID()}`).expect(404);
  });

  it('lists products filtered by categoryId', async () => {
    const product = await createProduct(ownerToken);

    const response = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ categoryId })
      .expect(200);

    expect(response.body.items.some((p: any) => p.id === product.id)).toBe(true);
  });

  it('rejects an update from a non-owner with 403', async () => {
    const product = await createProduct(ownerToken);

    await request(app.getHttpServer())
      .patch(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Titulo Roubado' })
      .expect(403);
  });

  it('allows the owner to update the product', async () => {
    const product = await createProduct(ownerToken);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Titulo Atualizado' })
      .expect(200);

    expect(response.body.title).toBe('Titulo Atualizado');
  });

  it('soft-deletes the product and hides it from detail + public listing afterwards', async () => {
    const product = await createProduct(ownerToken);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    await request(app.getHttpServer()).get(`/api/v1/products/${product.id}`).expect(404);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ categoryId })
      .expect(200);
    expect(listResponse.body.items.some((p: any) => p.id === product.id)).toBe(false);
  });

  it('rejects a delete from a non-owner with 403', async () => {
    const product = await createProduct(ownerToken);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  describe('variants', () => {
    it('creates a variant for an owned product', async () => {
      const product = await createProduct(ownerToken);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/products/${product.id}/variants`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          sku: `SKU-${randomUUID()}`,
          attributes: { color: 'Preto' },
          price: 199.9,
          weightGrams: 250,
          heightCm: 5,
          widthCm: 10,
          lengthCm: 15,
        })
        .expect(201);
      createdVariantIds.push(response.body.id);

      expect(response.body.productId).toBe(product.id);
      expect(response.body.price).toBe('199.90');
    });

    it('rejects a variant creation for a product owned by someone else', async () => {
      const product = await createProduct(ownerToken);

      await request(app.getHttpServer())
        .post(`/api/v1/products/${product.id}/variants`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          sku: `SKU-${randomUUID()}`,
          attributes: {},
          price: 10,
          weightGrams: 10,
          heightCm: 1,
          widthCm: 1,
          lengthCm: 1,
        })
        .expect(403);
    });

    it('rejects a duplicate sku with 409', async () => {
      const product = await createProduct(ownerToken);
      const sku = `SKU-${randomUUID()}`;

      const first = await request(app.getHttpServer())
        .post(`/api/v1/products/${product.id}/variants`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sku, attributes: {}, price: 10, weightGrams: 10, heightCm: 1, widthCm: 1, lengthCm: 1 })
        .expect(201);
      createdVariantIds.push(first.body.id);

      await request(app.getHttpServer())
        .post(`/api/v1/products/${product.id}/variants`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sku, attributes: {}, price: 20, weightGrams: 10, heightCm: 1, widthCm: 1, lengthCm: 1 })
        .expect(409);
    });
  });
});
