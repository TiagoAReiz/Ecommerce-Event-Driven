import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('Sellers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const createdSellerIds: string[] = [];

  function signToken(sub: string, role = 'CUSTOMER'): Promise<string> {
    return jwtService.signAsync(
      { sub, email: `${sub}@example.com`, role },
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
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: createdSellerIds } } });
    await prisma.seller.deleteMany({ where: { id: { in: createdSellerIds } } });
    await app.close();
  });

  it('rejects onboarding without a bearer token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .send({ storeName: 'Loja', document: randomUUID(), mpCollectorId: 'mp-1' })
      .expect(401);
  });

  it('rejects onboarding with missing fields', async () => {
    const token = await signToken(`user-${randomUUID()}`);
    await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'Loja' })
      .expect(400);
  });

  it('onboards a seller as ACTIVE and writes a SellerOnboarded outbox event', async () => {
    const userId = `user-${randomUUID()}`;
    const token = await signToken(userId);
    const document = randomUUID();

    const response = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'Loja E2E', document, mpCollectorId: 'mp-e2e-1' })
      .expect(201);

    createdSellerIds.push(response.body.id);
    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.userId).toBe(userId);

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { eventType: 'SellerOnboarded', aggregateId: response.body.id },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0].payload).toMatchObject({
      sellerId: response.body.id,
      userId,
      storeName: 'Loja E2E',
      document,
      mpCollectorId: 'mp-e2e-1',
    });
  });

  it('rejects onboarding twice for the same user', async () => {
    const userId = `user-${randomUUID()}`;
    const token = await signToken(userId);

    const first = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'Loja Dupla', document: randomUUID(), mpCollectorId: 'mp-e2e-2' })
      .expect(201);
    createdSellerIds.push(first.body.id);

    await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'Loja Dupla 2', document: randomUUID(), mpCollectorId: 'mp-e2e-3' })
      .expect(409);
  });

  it('rejects a duplicate document across different users', async () => {
    const document = randomUUID();
    const tokenA = await signToken(`user-${randomUUID()}`);
    const first = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ storeName: 'Loja A', document, mpCollectorId: 'mp-e2e-4' })
      .expect(201);
    createdSellerIds.push(first.body.id);

    const tokenB = await signToken(`user-${randomUUID()}`);
    await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ storeName: 'Loja B', document, mpCollectorId: 'mp-e2e-5' })
      .expect(409);
  });

  it('returns and updates the caller-owned seller via /sellers/me', async () => {
    const userId = `user-${randomUUID()}`;
    const token = await signToken(userId);
    const created = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'Loja Me', document: randomUUID(), mpCollectorId: 'mp-e2e-6' })
      .expect(201);
    createdSellerIds.push(created.body.id);

    const me = await request(app.getHttpServer())
      .get('/api/v1/sellers/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.id).toBe(created.body.id);

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/sellers/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'Loja Me Renomeada' })
      .expect(200);
    expect(updated.body.storeName).toBe('Loja Me Renomeada');
  });

  it('returns 404 on /sellers/me for a user that never onboarded', async () => {
    const token = await signToken(`user-${randomUUID()}`);
    await request(app.getHttpServer())
      .get('/api/v1/sellers/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('exposes a public storefront that hides document and mpCollectorId', async () => {
    const userId = `user-${randomUUID()}`;
    const token = await signToken(userId);
    const created = await request(app.getHttpServer())
      .post('/api/v1/sellers')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeName: 'Loja Publica', document: randomUUID(), mpCollectorId: 'mp-e2e-7' })
      .expect(201);
    createdSellerIds.push(created.body.id);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/sellers/${created.body.id}`)
      .expect(200);

    expect(response.body.storeName).toBe('Loja Publica');
    expect(response.body).not.toHaveProperty('document');
    expect(response.body).not.toHaveProperty('mpCollectorId');
    expect(response.body).not.toHaveProperty('userId');
  });

  it('returns 404 for a public seller lookup with an unknown id', async () => {
    await request(app.getHttpServer()).get(`/api/v1/sellers/${randomUUID()}`).expect(404);
  });
});
