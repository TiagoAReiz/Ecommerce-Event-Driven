import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('GET /api/v1/notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const createdLogIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const ownLogs = await Promise.all([
      prisma.notificationLog.create({
        data: {
          userId,
          type: 'ORDER_CREATED',
          recipientEmail: 'own@example.com',
          subject: 'Seu pedido foi criado',
          status: 'SENT',
          sentAt: new Date(),
        },
      }),
      prisma.notificationLog.create({
        data: {
          userId,
          type: 'PAYMENT_CONFIRMED',
          recipientEmail: 'own@example.com',
          subject: 'Pagamento confirmado',
          status: 'SENT',
          sentAt: new Date(),
        },
      }),
    ]);
    const otherLog = await prisma.notificationLog.create({
      data: {
        userId: otherUserId,
        type: 'ORDER_CREATED',
        recipientEmail: 'other@example.com',
        subject: 'Seu pedido foi criado',
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    createdLogIds.push(...ownLogs.map((l) => l.id), otherLog.id);
  });

  afterAll(async () => {
    await prisma.notificationLog.deleteMany({ where: { id: { in: createdLogIds } } });
    await app.close();
  });

  function tokenFor(sub: string) {
    return jwtService.signAsync(
      { sub, email: 'user@example.com', role: 'CUSTOMER' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  }

  it('returns 401 without a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
  });

  it("returns only the caller's own notifications, newest first", async () => {
    const accessToken = await tokenFor(userId);

    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.every((item: any) => item.recipientEmail === 'own@example.com')).toBe(
      true,
    );
  });

  it('paginates via page/limit query params', async () => {
    const accessToken = await tokenFor(userId);

    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .query({ page: 1, limit: 1 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(1);
    expect(response.body.total).toBe(2);
  });
});
