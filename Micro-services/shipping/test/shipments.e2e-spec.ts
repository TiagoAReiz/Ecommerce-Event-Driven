import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('GET /api/v1/shipments/:subOrderId (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const userId = randomUUID();
  const otherUserId = randomUUID();
  const subOrderId = randomUUID();
  const createdAddressIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const address = await prisma.address.create({
      data: {
        ownerType: 'CUSTOMER',
        ownerId: userId,
        cep: '01310-100',
        street: 'X',
        number: '1',
        neighborhood: 'B',
        city: 'SP',
        state: 'SP',
      },
    });
    createdAddressIds.push(address.id);
    await prisma.shipment.create({
      data: {
        subOrderId,
        orderId: randomUUID(),
        userId,
        addressId: address.id,
        carrier: 'PAC',
        trackingCode: 'PC123456789BR',
        status: 'POSTED',
      },
    });
  });

  afterAll(async () => {
    await prisma.shipment.deleteMany({ where: { subOrderId } });
    await prisma.address.deleteMany({ where: { id: { in: createdAddressIds } } });
    await app.close();
  });

  function tokenFor(sub: string) {
    return jwtService.signAsync({ sub, email: 'u@e.com', role: 'CUSTOMER' }, { secret: process.env.JWT_ACCESS_SECRET });
  }

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get(`/api/v1/shipments/${subOrderId}`).expect(401);
  });

  it('returns the shipment to its owner', async () => {
    const token = await tokenFor(userId);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/shipments/${subOrderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({ subOrderId, carrier: 'PAC', status: 'POSTED' });
  });

  it('denies access to another user (403)', async () => {
    const token = await tokenFor(otherUserId);
    await request(app.getHttpServer())
      .get(`/api/v1/shipments/${subOrderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 for an unknown subOrder', async () => {
    const token = await tokenFor(userId);
    await request(app.getHttpServer())
      .get(`/api/v1/shipments/${randomUUID()}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
