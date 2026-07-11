import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { CATALOG_CLIENT } from '../src/core/interfaces/external/catalog-client.interface';
import type { ICatalogClient } from '../src/core/interfaces/external/catalog-client.interface';

describe('cart-service (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let catalogClientMock: jest.Mocked<ICatalogClient>;
  let accessToken: string;
  const userId = randomUUID();

  beforeAll(async () => {
    catalogClientMock = { getVariant: jest.fn() };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CATALOG_CLIENT)
      .useValue(catalogClientMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);

    const jwtService = new JwtService();
    accessToken = await jwtService.signAsync(
      { sub: userId, email: 'cart-e2e@example.com', role: 'CUSTOMER' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
    await prisma.cart.deleteMany({ where: { userId } });
    await app.close();
  });

  function authed(req: request.Test): request.Test {
    return req.set('Authorization', `Bearer ${accessToken}`);
  }

  describe('GET /api/v1/cart', () => {
    it('rejects without a bearer token', async () => {
      await request(app.getHttpServer()).get('/api/v1/cart').expect(401);
    });

    it('creates and returns an empty cart on first access', async () => {
      const response = await authed(request(app.getHttpServer()).get('/api/v1/cart')).expect(200);

      expect(response.body.userId).toBe(userId);
      expect(response.body.items).toEqual([]);
    });

    it('returns the same cart on a second access (does not duplicate)', async () => {
      const first = await authed(request(app.getHttpServer()).get('/api/v1/cart')).expect(200);
      const second = await authed(request(app.getHttpServer()).get('/api/v1/cart')).expect(200);

      expect(second.body.id).toBe(first.body.id);
    });
  });

  describe('POST /api/v1/cart/items', () => {
    it('rejects a malformed body with 400', async () => {
      await authed(request(app.getHttpServer()).post('/api/v1/cart/items'))
        .send({ quantity: 1 })
        .expect(400);
    });

    it('returns 404 when the catalog does not know the variant', async () => {
      catalogClientMock.getVariant.mockResolvedValueOnce(null);

      await authed(request(app.getHttpServer()).post('/api/v1/cart/items'))
        .send({ variantId: randomUUID(), quantity: 1 })
        .expect(404);
    });

    it('adds an item resolved via the (mocked) catalog client, repassing the JWT', async () => {
      const variantId = randomUUID();
      const sellerId = randomUUID();
      catalogClientMock.getVariant.mockResolvedValueOnce({ variantId, sellerId, price: '99.90' });

      const response = await authed(request(app.getHttpServer()).post('/api/v1/cart/items'))
        .send({ variantId, quantity: 2 })
        .expect(201);

      expect(catalogClientMock.getVariant).toHaveBeenCalledWith(variantId, accessToken);
      expect(response.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            variantId,
            sellerId,
            quantity: 2,
            unitPriceSnapshot: '99.90',
          }),
        ]),
      );
    });

    it('sums the quantity when the same variant is added again', async () => {
      const variantId = randomUUID();
      const sellerId = randomUUID();
      catalogClientMock.getVariant.mockResolvedValue({ variantId, sellerId, price: '10.00' });

      await authed(request(app.getHttpServer()).post('/api/v1/cart/items')).send({
        variantId,
        quantity: 1,
      });
      const response = await authed(request(app.getHttpServer()).post('/api/v1/cart/items')).send({
        variantId,
        quantity: 3,
      });

      const item = response.body.items.find((i: any) => i.variantId === variantId);
      expect(item.quantity).toBe(4);
    });
  });

  describe('PATCH /api/v1/cart/items/:id and DELETE /api/v1/cart/items/:id', () => {
    it('updates the quantity of an owned item', async () => {
      const variantId = randomUUID();
      catalogClientMock.getVariant.mockResolvedValueOnce({
        variantId,
        sellerId: randomUUID(),
        price: '5.00',
      });
      const added = await authed(request(app.getHttpServer()).post('/api/v1/cart/items')).send({
        variantId,
        quantity: 1,
      });
      const itemId = added.body.items.find((i: any) => i.variantId === variantId).id;

      const response = await authed(
        request(app.getHttpServer()).patch(`/api/v1/cart/items/${itemId}`),
      )
        .send({ quantity: 9 })
        .expect(200);

      const item = response.body.items.find((i: any) => i.id === itemId);
      expect(item.quantity).toBe(9);
    });

    it('returns 404 when updating an item that does not exist', async () => {
      await authed(request(app.getHttpServer()).patch(`/api/v1/cart/items/${randomUUID()}`))
        .send({ quantity: 2 })
        .expect(404);
    });

    it('returns 403 when the item belongs to a different user', async () => {
      const otherUserId = randomUUID();
      const otherToken = await new JwtService().signAsync(
        { sub: otherUserId, email: 'other@example.com', role: 'CUSTOMER' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      const variantId = randomUUID();
      catalogClientMock.getVariant.mockResolvedValueOnce({
        variantId,
        sellerId: randomUUID(),
        price: '5.00',
      });
      const added = await authed(request(app.getHttpServer()).post('/api/v1/cart/items')).send({
        variantId,
        quantity: 1,
      });
      const itemId = added.body.items.find((i: any) => i.variantId === variantId).id;

      await request(app.getHttpServer())
        .patch(`/api/v1/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ quantity: 2 })
        .expect(403);

      await prisma.cart.deleteMany({ where: { userId: otherUserId } });
    });

    it('removes an owned item', async () => {
      const variantId = randomUUID();
      catalogClientMock.getVariant.mockResolvedValueOnce({
        variantId,
        sellerId: randomUUID(),
        price: '5.00',
      });
      const added = await authed(request(app.getHttpServer()).post('/api/v1/cart/items')).send({
        variantId,
        quantity: 1,
      });
      const itemId = added.body.items.find((i: any) => i.variantId === variantId).id;

      const response = await authed(
        request(app.getHttpServer()).delete(`/api/v1/cart/items/${itemId}`),
      ).expect(200);

      expect(response.body.items.find((i: any) => i.id === itemId)).toBeUndefined();
    });
  });

  describe('DELETE /api/v1/cart', () => {
    it('empties the cart (used internally by order-service post-checkout)', async () => {
      const variantId = randomUUID();
      catalogClientMock.getVariant.mockResolvedValueOnce({
        variantId,
        sellerId: randomUUID(),
        price: '5.00',
      });
      await authed(request(app.getHttpServer()).post('/api/v1/cart/items')).send({
        variantId,
        quantity: 1,
      });

      await authed(request(app.getHttpServer()).delete('/api/v1/cart')).expect(204);

      const response = await authed(request(app.getHttpServer()).get('/api/v1/cart')).expect(200);
      expect(response.body.items).toEqual([]);
    });

    it('is idempotent when the cart is already empty', async () => {
      await authed(request(app.getHttpServer()).delete('/api/v1/cart')).expect(204);
      await authed(request(app.getHttpServer()).delete('/api/v1/cart')).expect(204);
    });
  });
});
