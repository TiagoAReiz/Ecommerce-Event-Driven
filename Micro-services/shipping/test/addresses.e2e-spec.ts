import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('/api/v1/addresses (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sellerId = randomUUID();
  const createdAddressIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await prisma.address.deleteMany({ where: { id: { in: createdAddressIds } } });
    await app.close();
  });

  function tokenFor(sub: string, role = 'CUSTOMER') {
    return jwtService.signAsync({ sub, email: 'u@e.com', role }, { secret: process.env.JWT_ACCESS_SECRET });
  }

  const body = {
    ownerType: 'CUSTOMER',
    cep: '01310100',
    street: 'Av Paulista',
    number: '1000',
    neighborhood: 'Bela Vista',
    city: 'SP',
    state: 'SP',
  };

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/v1/addresses').expect(401);
  });

  it('creates a CUSTOMER address owned by the caller (ownerId forced to sub)', async () => {
    const token = await tokenFor(userId);
    const res = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    expect(res.body.ownerType).toBe('CUSTOMER');
    expect(res.body.ownerId).toBe(userId);
    createdAddressIds.push(res.body.id);
  });

  it('lists only the caller own addresses', async () => {
    const token = await tokenFor(userId);
    const res = await request(app.getHttpServer())
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.every((a: any) => a.ownerId === userId)).toBe(true);
  });

  it('denies access to another user address (404 not found / 403 forbidden)', async () => {
    const created = createdAddressIds[0];
    const token = await tokenFor(otherUserId);
    await request(app.getHttpServer())
      .get(`/api/v1/addresses/${created}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects a customer trying to create a SELLER address', async () => {
    const token = await tokenFor(userId, 'CUSTOMER');
    await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, ownerType: 'SELLER', ownerId: sellerId })
      .expect(403);
  });

  it('lets a seller create and find a SELLER address by sellerId', async () => {
    const token = await tokenFor(randomUUID(), 'SELLER');
    const res = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, ownerType: 'SELLER', ownerId: sellerId })
      .expect(201);
    expect(res.body.ownerId).toBe(sellerId);
    createdAddressIds.push(res.body.id);

    const list = await request(app.getHttpServer())
      .get('/api/v1/addresses')
      .query({ ownerType: 'SELLER', ownerId: sellerId })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.some((a: any) => a.id === res.body.id)).toBe(true);
  });

  it('updates and deletes an owned address', async () => {
    const token = await tokenFor(userId);
    const id = createdAddressIds[0];
    await request(app.getHttpServer())
      .patch(`/api/v1/addresses/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ number: '2000' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/addresses/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    createdAddressIds.shift();
  });
});
