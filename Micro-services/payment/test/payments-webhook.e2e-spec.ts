import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createHmac, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

// e2e do webhook do Mercado Pago (assinatura stubada) + dedupe. NÃO roda no gate unit (é excluído do
// jest de unit e do tsconfig.build); o orquestrador roda depois com Postgres+Kafka de pé.
describe('Payments webhook (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const orderId = `order-${randomUUID()}`;
  const userId = `user-${randomUUID()}`;
  const sellerId = `seller-${randomUUID()}`;
  const mpPaymentId = `mp-pay-${randomUUID()}`;
  const secret = process.env.MP_WEBHOOK_SECRET ?? 'dev-mp-webhook-secret-change-me';

  let paymentId: string;

  function sign(body: unknown): string {
    return createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = new JwtService();

    await prisma.sellerPaymentProfile.create({
      data: { sellerId, userId, mpCollectorId: 'mp-collector-1' },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId,
        userId,
        method: 'PIX',
        status: 'PENDING',
        totalAmount: '130.00',
        mpPreferenceId: `mp-pref-${orderId}`,
        splits: {
          create: [
            {
              subOrderId: `sub-${randomUUID()}`,
              sellerId,
              mpCollectorId: 'mp-collector-1',
              amount: '110.00',
              platformFeeAmount: '10.00',
            },
          ],
        },
      },
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: orderId } });
    await prisma.mpWebhookEvent.deleteMany({ where: { rawPayload: { path: ['orderId'], equals: orderId } } });
    await prisma.paymentSplit.deleteMany({ where: { paymentId } });
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.sellerPaymentProfile.deleteMany({ where: { sellerId } });
    await app.close();
  });

  it('rejects a webhook with an invalid signature (401)', async () => {
    const body = { id: `mp-evt-${randomUUID()}`, type: 'payment', data: { id: mpPaymentId }, orderId, status: 'approved' };
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/mercadopago')
      .set('x-signature', 'not-a-valid-signature')
      .send(body)
      .expect(401);
  });

  it('confirms an approved payment, records the webhook and enqueues PaymentConfirmed once (idempotent on redelivery)', async () => {
    const mpEventId = `mp-evt-${randomUUID()}`;
    const body = { id: mpEventId, type: 'payment', data: { id: mpPaymentId }, orderId, status: 'approved', method: 'PIX' };
    const signature = sign(body);

    const first = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/mercadopago')
      .set('x-signature', signature)
      .send(body)
      .expect(201);
    expect(first.body).toEqual({ status: 'confirmed' });

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(payment.status).toBe('APPROVED');
    expect(payment.mpPaymentId).toBe(mpPaymentId);

    const outbox = await prisma.outboxEvent.findMany({
      where: { aggregateId: orderId, eventType: 'PaymentConfirmed' },
    });
    expect(outbox).toHaveLength(1);

    // Redelivery: mesmo mpEventId -> duplicate, sem segundo outbox nem mudança de estado.
    const second = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook/mercadopago')
      .set('x-signature', signature)
      .send(body)
      .expect(201);
    expect(second.body).toEqual({ status: 'duplicate' });

    const outboxAfter = await prisma.outboxEvent.findMany({
      where: { aggregateId: orderId, eventType: 'PaymentConfirmed' },
    });
    expect(outboxAfter).toHaveLength(1);
  });

  it('returns payment status + init_point to the owner, and 403 to a stranger', async () => {
    const ownerToken = await jwtService.signAsync(
      { sub: userId, email: `${userId}@example.com`, role: 'CUSTOMER' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
    const strangerToken = await jwtService.signAsync(
      { sub: `other-${randomUUID()}`, email: 'x@y.com', role: 'CUSTOMER' },
      { secret: process.env.JWT_ACCESS_SECRET },
    );

    const ok = await request(app.getHttpServer())
      .get(`/api/v1/payments/${orderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(ok.body.orderId).toBe(orderId);
    expect(ok.body.initPoint).toContain(`mp-pref-${orderId}`);

    await request(app.getHttpServer())
      .get(`/api/v1/payments/${orderId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);
  });
});
