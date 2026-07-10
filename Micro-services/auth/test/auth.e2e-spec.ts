import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
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
        buildAuthUrl: (state: string) => `https://accounts.google.com/mock?state=${state}`,
        exchangeCodeForProfile: async () => ({
          googleId,
          email,
          name: 'E2E User',
          avatarUrl: null,
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
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

  async function startOAuthFlow(): Promise<{ stateCookie: string; state: string }> {
    const startResponse = await request(app.getHttpServer()).get('/api/v1/auth/google').expect(302);
    const setCookieHeader = startResponse.headers['set-cookie'] as unknown as string[];
    const stateCookie = setCookieHeader.find((c) => c.startsWith('oauth_state='))!;
    const state = stateCookie.split(';')[0].split('=')[1];
    return { stateCookie, state };
  }

  it('logs in with a Google code, creates the user, and writes a UserRegistered outbox event', async () => {
    const { stateCookie, state } = await startOAuthFlow();

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .set('Cookie', stateCookie)
      .query({ code: 'fake-code', state })
      .expect(200);

    expect(response.body.user.email).toBe(email);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { eventType: 'UserRegistered', aggregateId: response.body.user.id },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(['PENDING', 'PUBLISHED']).toContain(outboxEvents[0].status);
  });

  it('rejects the callback when the state does not match the cookie', async () => {
    const { stateCookie } = await startOAuthFlow();

    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .set('Cookie', stateCookie)
      .query({ code: 'fake-code', state: 'tampered-state' })
      .expect(400);
  });

  it('rejects the callback with no state cookie at all', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .query({ code: 'fake-code', state: 'some-state' })
      .expect(400);
  });

  it('issues a new access token from the refresh token', async () => {
    const { stateCookie, state } = await startOAuthFlow();
    const login = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .set('Cookie', stateCookie)
      .query({ code: 'fake-code', state })
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

  it('rejects refresh with an invalid refreshToken', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
  });
});
