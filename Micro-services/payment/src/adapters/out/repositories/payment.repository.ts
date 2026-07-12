import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  Payment as PrismaPayment,
  PaymentSplit as PrismaPaymentSplit,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  Payment,
  PaymentMethod,
  PaymentSplit,
  PaymentSplitStatus,
  PaymentStatus,
} from '../../../core/entities/payment.entity';
import {
  CreatePaymentData,
  IPaymentRepository,
  RefundOnCancelResult,
  SellerSplitView,
  WebhookConfirmData,
  WebhookFailData,
  WebhookResult,
} from '../../../core/interfaces/repositories/payment-repository.interface';

type PaymentWithSplits = PrismaPayment & { splits: PrismaPaymentSplit[] };

@Injectable()
export class PaymentRepository implements IPaymentRepository {
  private readonly logger = new Logger(PaymentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const row = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: { splits: true },
    });
    return row ? this.toEntity(row) : null;
  }

  async findSplitsBySellerIds(sellerIds: string[]): Promise<SellerSplitView[]> {
    if (sellerIds.length === 0) return [];
    const rows = await this.prisma.paymentSplit.findMany({
      where: { sellerId: { in: sellerIds } },
      orderBy: { createdAt: 'desc' },
      include: { payment: true },
    });
    return rows.map((row) => ({
      id: row.id,
      paymentId: row.paymentId,
      orderId: row.payment.orderId,
      subOrderId: row.subOrderId,
      sellerId: row.sellerId,
      // MONEY: Decimal -> string fixed-2 (preserva zeros à direita: "15.00", não "15").
      amount: row.amount.toFixed(2),
      platformFeeAmount: row.platformFeeAmount.toFixed(2),
      status: row.status as PaymentSplitStatus,
      createdAt: row.createdAt,
    }));
  }

  async createPaymentWithSplits(
    eventId: string,
    eventType: string,
    data: CreatePaymentData,
  ): Promise<Payment | null> {
    let created: PaymentWithSplits | null = null;

    await this.prisma.$transaction(async (tx) => {
      // dedupe de inbox: OrderReadyForPayment reentregue -> no-op
      if (await tx.processedEvent.findUnique({ where: { eventId } })) return;

      const payment = await tx.payment.create({
        data: {
          orderId: data.orderId,
          userId: data.userId,
          method: data.method,
          totalAmount: data.totalAmount,
          mpPreferenceId: data.mpPreferenceId,
          splits: {
            create: data.splits.map((s) => ({
              subOrderId: s.subOrderId,
              sellerId: s.sellerId,
              mpCollectorId: s.mpCollectorId,
              amount: s.amount,
              platformFeeAmount: s.platformFeeAmount,
            })),
          },
        },
        include: { splits: true },
      });

      await tx.processedEvent.create({ data: { eventId, eventType } });
      created = payment;
    });

    return created ? this.toEntity(created) : null;
  }

  async confirmFromWebhook(data: WebhookConfirmData): Promise<WebhookResult> {
    return this.applyWebhook(data, 'approved');
  }

  async failFromWebhook(data: WebhookFailData): Promise<WebhookResult> {
    return this.applyWebhook(data, 'rejected');
  }

  // Núcleo transacional compartilhado do webhook: grava MpWebhookEvent (dedupe por mpEventId),
  // transiciona o Payment PENDING e insere o outbox correspondente. O payload de saída
  // (PaymentConfirmed/PaymentFailed) é montado AQUI porque a lista de splits vem das linhas do banco
  // e precisa ser lida na mesma transação (consistência forte com o estado promovido).
  private async applyWebhook(
    data: WebhookConfirmData | WebhookFailData,
    outcome: 'approved' | 'rejected',
  ): Promise<WebhookResult> {
    let published = false;

    await this.prisma.$transaction(async (tx) => {
      // dedupe do webhook: mpEventId é único; se já registramos, é redelivery -> no-op
      if (await tx.mpWebhookEvent.findUnique({ where: { mpEventId: data.mpEventId } })) return;

      const payment = await tx.payment.findFirst({
        where: { orderId: data.orderId },
        orderBy: { createdAt: 'desc' },
        include: { splits: true },
      });

      // Registra o webhook mesmo em caso anômalo (sem Payment ou fora de PENDING) pra não reprocessar;
      // processedAt fica preenchido quando havia um Payment pra decidir, null quando era órfão.
      await tx.mpWebhookEvent.create({
        data: {
          mpEventId: data.mpEventId,
          type: data.type,
          rawPayload: data.rawPayload as Prisma.InputJsonValue,
          processedAt: payment ? new Date() : undefined,
        },
      });

      if (!payment) {
        this.logger.warn(`Webhook ${data.mpEventId} for unknown order ${data.orderId}`);
        return;
      }
      if (payment.status !== 'PENDING') {
        this.logger.warn(
          `Webhook ${data.mpEventId} ignored: payment ${payment.id} is ${payment.status}, not PENDING`,
        );
        return;
      }

      if (outcome === 'approved') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'APPROVED', mpPaymentId: data.mpPaymentId, method: data.method },
        });
        await tx.paymentSplit.updateMany({
          where: { paymentId: payment.id },
          data: { status: 'SETTLED' },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Payment',
            aggregateId: payment.orderId, // key = orderId (spec): mantém ordem por pedido no tópico
            eventType: 'PaymentConfirmed',
            payload: {
              paymentId: payment.id,
              orderId: payment.orderId,
              userId: payment.userId,
              method: data.method,
              totalAmount: payment.totalAmount.toFixed(2),
              splits: payment.splits.map((s) => ({
                subOrderId: s.subOrderId,
                sellerId: s.sellerId,
                amount: s.amount.toFixed(2),
                platformFeeAmount: s.platformFeeAmount.toFixed(2),
              })),
            } as Prisma.InputJsonValue,
          },
        });
      } else {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REJECTED', mpPaymentId: data.mpPaymentId, method: data.method },
        });
        await tx.paymentSplit.updateMany({
          where: { paymentId: payment.id },
          data: { status: 'FAILED' },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Payment',
            aggregateId: payment.orderId,
            eventType: 'PaymentFailed',
            payload: {
              paymentId: payment.id,
              orderId: payment.orderId,
              userId: payment.userId,
              method: data.method,
              reason: (data as WebhookFailData).reason,
            } as Prisma.InputJsonValue,
          },
        });
      }
      published = true;
    });

    return { published };
  }

  async refundOnCancel(
    eventId: string,
    eventType: string,
    orderId: string,
    refundFn: (mpPaymentId: string) => Promise<{ refundId: string }>,
  ): Promise<RefundOnCancelResult> {
    let refunded = false;
    let alreadyProcessed = false;

    await this.prisma.$transaction(async (tx) => {
      // dedupe de inbox: OrderCancelled reentregue -> no-op
      if (await tx.processedEvent.findUnique({ where: { eventId } })) {
        alreadyProcessed = true;
        return;
      }

      const payment = await tx.payment.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
        include: { splits: true },
      });

      // Guarda de status: só estorna se estava APPROVED. PENDING/REJECTED/EXPIRED/REFUNDED -> no-op
      // idempotente (mas ainda gravamos o ProcessedEvent pra não reavaliar em cada redelivery).
      if (payment && payment.status === 'APPROVED' && payment.mpPaymentId) {
        // refund do gateway (stub) DENTRO da transação: dispara uma única vez sob o dedupe, mesmo que
        // o OrderCancelled liste vários subOrderIds.
        await refundFn(payment.mpPaymentId);

        await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Payment',
            aggregateId: payment.orderId,
            eventType: 'PaymentRefunded',
            payload: {
              paymentId: payment.id,
              orderId: payment.orderId,
              userId: payment.userId,
              refundedAmount: payment.totalAmount.toFixed(2),
              splits: payment.splits.map((s) => ({
                subOrderId: s.subOrderId,
                sellerId: s.sellerId,
                amount: s.amount.toFixed(2),
              })),
            } as Prisma.InputJsonValue,
          },
        });
        refunded = true;
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });

    return { refunded, alreadyProcessed };
  }

  private toEntity(row: PaymentWithSplits): Payment {
    return new Payment({
      id: row.id,
      orderId: row.orderId,
      userId: row.userId,
      method: row.method as PaymentMethod,
      status: row.status as PaymentStatus,
      // MONEY: Decimal -> string fixed-2
      totalAmount: row.totalAmount.toFixed(2),
      mpPaymentId: row.mpPaymentId,
      mpPreferenceId: row.mpPreferenceId,
      splits: row.splits.map(
        (s) =>
          new PaymentSplit({
            id: s.id,
            paymentId: s.paymentId,
            subOrderId: s.subOrderId,
            sellerId: s.sellerId,
            mpCollectorId: s.mpCollectorId,
            amount: s.amount.toFixed(2),
            platformFeeAmount: s.platformFeeAmount.toFixed(2),
            status: s.status as PaymentSplitStatus,
          }),
      ),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
