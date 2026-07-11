import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { CATALOG_CLIENT } from '../src/core/interfaces/external/catalog-client.interface';
import type {
  CatalogSeller,
  CatalogVariant,
  ICatalogClient,
} from '../src/core/interfaces/external/catalog-client.interface';

// Fake do catalog-service: a resolução de ownership é uma chamada síncrona HTTP no runtime,
// aqui é substituída por um stub configurável (não precisamos de um catalog real no e2e).
class FakeCatalogClient implements ICatalogClient {
  seller: CatalogSeller | null = { id: 'seller-owner', status: 'ACTIVE' };
  variantOwner = 'seller-owner';
  variantExists = true;

  async getMySeller(): Promise<CatalogSeller | null> {
    return this.seller;
  }

  async getVariant(variantId: string): Promise<CatalogVariant | null> {
    if (!this.variantExists) return null;
    return { variantId, sellerId: this.variantOwner };
  }
}

describe('Stock endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let catalog: FakeCatalogClient;

  const createdVariantIds: string[] = [];

  function signToken(sub: string): Promise<string> {
    return jwtService.signAsync(
      { sub, email: `${sub}@example.com`, role: 'CUSTOMER' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  }

  beforeAll(async () => {
    catalog = new FakeCatalogClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CATALOG_CLIENT)
      .useValue(catalog)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = new JwtService();
  });

  afterAll(async () => {
    await prisma.stockReservation.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.stockItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await app.close();
  });

  beforeEach(() => {
    catalog.seller = { id: 'seller-owner', status: 'ACTIVE' };
    catalog.variantOwner = 'seller-owner';
    catalog.variantExists = true;
  });

  it('POST /stock initializes a StockItem for an owned variant', async () => {
    const variantId = randomUUID();
    createdVariantIds.push(variantId);
    const token = await signToken(`owner-${randomUUID()}`);

    const response = await request(app.getHttpServer())
      .post('/api/v1/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, quantity: 25 })
      .expect(201);

    expect(response.body).toMatchObject({
      variantId,
      sellerId: 'seller-owner',
      quantity: 25,
      reservedQty: 0,
      available: 25,
    });
  });

  it('GET /stock/:variantId is public and returns available = quantity - reservedQty', async () => {
    const variantId = randomUUID();
    createdVariantIds.push(variantId);
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-owner', quantity: 10, reservedQty: 4 },
    });

    const response = await request(app.getHttpServer()).get(`/api/v1/stock/${variantId}`).expect(200);

    expect(response.body).toEqual({ variantId, available: 6, quantity: 10, reservedQty: 4 });
  });

  it('GET /stock/:variantId returns 404 for an untracked variant', async () => {
    await request(app.getHttpServer()).get(`/api/v1/stock/${randomUUID()}`).expect(404);
  });

  it('POST /stock returns 409 when a StockItem already exists', async () => {
    const variantId = randomUUID();
    createdVariantIds.push(variantId);
    const token = await signToken(`owner-${randomUUID()}`);
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-owner', quantity: 5 },
    });

    await request(app.getHttpServer())
      .post('/api/v1/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, quantity: 10 })
      .expect(409);
  });

  it('POST /stock returns 403 when the variant belongs to another seller', async () => {
    const variantId = randomUUID();
    createdVariantIds.push(variantId);
    const token = await signToken(`owner-${randomUUID()}`);
    catalog.variantOwner = 'seller-other';

    await request(app.getHttpServer())
      .post('/api/v1/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, quantity: 10 })
      .expect(403);
  });

  it('POST /stock returns 403 when the caller has no active seller', async () => {
    const token = await signToken(`nobody-${randomUUID()}`);
    catalog.seller = null;

    await request(app.getHttpServer())
      .post('/api/v1/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId: randomUUID(), quantity: 10 })
      .expect(403);
  });

  it('POST /stock returns 404 when the variant does not exist in catalog', async () => {
    const token = await signToken(`owner-${randomUUID()}`);
    catalog.variantExists = false;

    await request(app.getHttpServer())
      .post('/api/v1/stock')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId: randomUUID(), quantity: 10 })
      .expect(404);
  });

  it('POST /stock without a token is rejected with 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/stock')
      .send({ variantId: randomUUID(), quantity: 10 })
      .expect(401);
  });

  it('PATCH /stock/:variantId updates quantity for the owner', async () => {
    const variantId = randomUUID();
    createdVariantIds.push(variantId);
    const token = await signToken(`owner-${randomUUID()}`);
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-owner', quantity: 5, reservedQty: 2 },
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/stock/${variantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 30 })
      .expect(200);

    expect(response.body).toMatchObject({ variantId, quantity: 30, reservedQty: 2, available: 28 });
  });

  it('PATCH /stock/:variantId returns 403 when the caller does not own the StockItem', async () => {
    const variantId = randomUUID();
    createdVariantIds.push(variantId);
    const token = await signToken(`owner-${randomUUID()}`);
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-other', quantity: 5 },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/stock/${variantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 30 })
      .expect(403);
  });

  it('PATCH /stock/:variantId returns 400 when lowering below the reserved amount', async () => {
    const variantId = randomUUID();
    createdVariantIds.push(variantId);
    const token = await signToken(`owner-${randomUUID()}`);
    await prisma.stockItem.create({
      data: { variantId, sellerId: 'seller-owner', quantity: 10, reservedQty: 6 },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/stock/${variantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3 })
      .expect(400);
  });
});
