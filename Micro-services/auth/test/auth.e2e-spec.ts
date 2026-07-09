import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { GoogleOAuthService } from '../src/core/auth/google-oauth.service';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const googleId = `google-${randomUUID()}`;
  const email = `${randomUUID()}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleOAuthService)
      .useValue({
        buildAuthUrl: () => 'https://accounts.google.com/mock',
        exchangeCodeForProfile: async () => ({
          googleId,
          email,
          name: 'E2E User',
          avatarUrl: null,
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: await userIds() } } });
    await prisma.user.deleteMany({ where: { googleId } });
    await app.close();
  });

  async function userIds(): Promise<string[]> {
    const users = await prisma.user.findMany({ where: { googleId }, select: { id: true } });
    return users.map((u) => u.id);
  }

  it('logs in with a Google code, creates the user, and writes a UserRegistered outbox event', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'fake-code' })
      .expect(200);

    expect(response.body.user.email).toBe(email);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { eventType: 'UserRegistered', aggregateId: response.body.user.id },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0].status).toBe('PENDING');
  });

  it('issues a new access token from the refresh token', async () => {
    const login = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'fake-code' })
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);

    expect(refreshed.body.accessToken).toBeDefined();
  });

  it('rejects refresh with a missing refreshToken', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({}).expect(400);
  });
});
