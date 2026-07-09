import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';
import { TokenService } from '../src/core/auth/token.service';

describe('GET /users/me (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    const user = await prisma.user.create({
      data: {
        googleId: `google-${randomUUID()}`,
        email: `${randomUUID()}@example.com`,
        name: 'Profile User',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('returns 401 without a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('returns the profile for a valid access token', async () => {
    const { accessToken } = await tokenService.issueTokenPair({
      sub: userId,
      email: 'profile@example.com',
      role: 'CUSTOMER',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.id).toBe(userId);
    expect(response.body.name).toBe('Profile User');
  });
});
