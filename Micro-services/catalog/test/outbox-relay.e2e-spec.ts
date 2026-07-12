import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('Outbox relay -> Kafka (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const createdSellerIds: string[] = [];

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

  it(
    'relays the SellerOnboarded outbox event to the catalog-events Kafka topic with a stable eventId',
    async () => {
      const userId = `user-${randomUUID()}`;
      const token = await jwtService.signAsync(
        { sub: userId, email: `${userId}@example.com`, role: 'CUSTOMER' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sellers')
        .set('Authorization', `Bearer ${token}`)
        .send({ storeName: 'Loja Relay E2E', document: randomUUID(), mpCollectorId: 'mp-relay-e2e' })
        .expect(201);

      const sellerId = response.body.id;
      createdSellerIds.push(sellerId);

      const outboxRow = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: sellerId, eventType: 'SellerOnboarded' },
      });

      const kafka = new KafkaJS.Kafka({
        kafkaJS: {
          clientId: 'catalog-outbox-relay-e2e-test',
          brokers: [process.env.KAFKA_BROKER ?? 'localhost:9094'],
        },
      });
      const consumer = kafka.consumer({
        kafkaJS: { groupId: `catalog-outbox-relay-e2e-${randomUUID()}`, fromBeginning: true },
      });
      await consumer.connect();
      await consumer.subscribe({ topic: 'catalog-events' });

      const matchingMessage = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for SellerOnboarded on catalog-events')),
          15000,
        );

        consumer
          .run({
            eachMessage: async ({ message }) => {
              const envelope = JSON.parse(message.value!.toString());
              if (envelope.eventType === 'SellerOnboarded' && envelope.aggregateId === sellerId) {
                clearTimeout(timeout);
                resolve(envelope);
              }
            },
          })
          .catch(reject);
      });

      await consumer.disconnect();

      expect(matchingMessage).toMatchObject({
        eventType: 'SellerOnboarded',
        aggregateType: 'Seller',
        aggregateId: sellerId,
        version: 1,
        payload: {
          sellerId,
          userId,
          storeName: 'Loja Relay E2E',
          mpCollectorId: 'mp-relay-e2e',
        },
      });
      expect(matchingMessage.eventId).toBe(outboxRow.id);

      const updatedRow = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: outboxRow.id } });
      expect(updatedRow.status).toBe('PUBLISHED');
    },
    20000,
  );
});
