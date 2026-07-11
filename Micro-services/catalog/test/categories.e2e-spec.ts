import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('GET /categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);

    const category = await prisma.category.create({
      data: { name: `E2E Categoria ${randomUUID()}`, slug: `e2e-categoria-${randomUUID()}` },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.category.delete({ where: { id: categoryId } });
    await app.close();
  });

  it('lists categories without requiring auth', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    const found = response.body.find((c: any) => c.id === categoryId);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty('createdAt');
  });
});
