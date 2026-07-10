import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { AppModule } from '../src/app.module';
import { GoogleOAuthService } from '../src/adapters/out/external/google-oauth.service';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('Outbox relay -> Kafka (e2e)', () => {
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
          name: 'Relay E2E User',
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

  it(
    'relays the UserRegistered outbox event to the auth-events Kafka topic with a stable eventId',
    async () => {
      const startResponse = await request(app.getHttpServer()).get('/api/v1/auth/google').expect(302);
      const setCookieHeader = startResponse.headers['set-cookie'] as unknown as string[];
      const stateCookie = setCookieHeader.find((c) => c.startsWith('oauth_state='))!;
      const state = stateCookie.split(';')[0].split('=')[1];

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .set('Cookie', stateCookie)
        .query({ code: 'fake-code', state })
        .expect(200);

      const userId = response.body.user.id;

      const outboxRow = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: userId, eventType: 'UserRegistered' },
      });

      const kafka = new KafkaJS.Kafka({
        kafkaJS: {
          clientId: 'auth-outbox-relay-e2e-test',
          brokers: [process.env.KAFKA_BROKER ?? 'localhost:9094'],
        },
      });
      const consumer = kafka.consumer({
        kafkaJS: { groupId: `auth-outbox-relay-e2e-${randomUUID()}`, fromBeginning: true },
      });
      await consumer.connect();
      await consumer.subscribe({ topic: 'auth-events' });

      const matchingMessage = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for UserRegistered on auth-events')),
          15000,
        );

        consumer
          .run({
            eachMessage: async ({ message }) => {
              const envelope = JSON.parse(message.value!.toString());
              if (envelope.eventType === 'UserRegistered' && envelope.aggregateId === userId) {
                clearTimeout(timeout);
                resolve(envelope);
              }
            },
          })
          .catch(reject);
      });

      await consumer.disconnect();

      expect(matchingMessage).toMatchObject({
        eventType: 'UserRegistered',
        aggregateType: 'User',
        aggregateId: userId,
        version: 1,
        payload: { userId, email, name: 'Relay E2E User', role: 'CUSTOMER' },
      });
      expect(matchingMessage.eventId).toBe(outboxRow.id);

      const updatedRow = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: outboxRow.id } });
      expect(updatedRow.status).toBe('PUBLISHED');
    },
    20000,
  );
});
