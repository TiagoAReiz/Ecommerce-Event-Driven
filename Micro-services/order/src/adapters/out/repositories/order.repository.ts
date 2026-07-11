import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Order as PrismaOrder,
  SubOrder as PrismaSubOrder,
  OrderItem as PrismaOrderItem,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Order } from '../../../core/entities/order.entity';
import { SubOrder, SubOrderStatus } from '../../../core/entities/sub-order.entity';
import { OrderItem } from '../../../core/entities/order-item.entity';
import {
  CancelInitiator,
  CreateOrderInput,
  IOrderRepository,
  ListFilter,
  OrderWithSubOrders,
  PaginatedResult,
  ReleaseReason,
  SubOrderWithItems,
} from '../../../core/interfaces/repositories/order-repository.interface';

type Tx = Prisma.TransactionClient;
type PrismaSubOrderWithItems = PrismaSubOrder & { items: PrismaOrderItem[] };
type PrismaOrderWithSubOrders = PrismaOrder & { subOrders: PrismaSubOrderWithItems[] };

const AGGREGATE_TYPE = 'Order';
// DELIVERED conta como terminal pra fins de "quem ainda pode ser cancelado" (não tem o que
// reverter); SHIPPED continua ativo mas bloqueia o cancelamento (ver BLOCKING_CANCEL_STATUSES).
const TERMINAL_SUBORDER_STATUSES: SubOrderStatus[] = ['CANCELLED', 'REFUNDED', 'DELIVERED'];
const BLOCKING_CANCEL_STATUSES: SubOrderStatus[] = ['SHIPPED', 'DELIVERED'];

interface Cursor {
  createdAt: string;
  id: string;
}

@Injectable()
export class OrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- checkout ----------

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<OrderWithSubOrders | null> {
    const row = await this.prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: { subOrders: { include: { items: true } } },
    });
    return row ? this.toAggregate(row) : null;
  }

  async createOrder(input: CreateOrderInput): Promise<{ order: OrderWithSubOrders; created: boolean }> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            id: input.id,
            userId: input.userId,
            addressId: input.addressId,
            idempotencyKey: input.idempotencyKey,
            totalAmount: input.totalAmount,
            subOrders: {
              create: input.subOrders.map((subOrder) => ({
                id: subOrder.id,
                sellerId: subOrder.sellerId,
                subtotalAmount: subOrder.subtotalAmount,
                items: {
                  create: subOrder.items.map((item) => ({
                    variantId: item.variantId,
                    skuSnapshot: item.sku,
                    titleSnapshot: item.title,
                    unitPriceSnapshot: item.unitPrice,
                    quantity: item.quantity,
                    weightGramsSnapshot: item.weightGrams,
                  })),
                },
              })),
            },
          },
          include: { subOrders: { include: { items: true } } },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: AGGREGATE_TYPE,
            aggregateId: created.id,
            eventType: 'OrderCreated',
            payload: input.outboxPayload as Prisma.InputJsonValue,
          },
        });

        return created;
      });

      return { order: this.toAggregate(row), created: true };
    } catch (error) {
      // Corrida de double-submit: duas transações concorrentes com a mesma (userId,
      // idempotencyKey) — a segunda perde a constraint única e recupera o Order da primeira.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findByIdempotencyKey(input.userId, input.idempotencyKey);
        if (existing) return { order: existing, created: false };
      }
      throw error;
    }
  }

  // ---------- leitura ----------

  async findById(orderId: string): Promise<OrderWithSubOrders | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { subOrders: { include: { items: true } } },
    });
    return row ? this.toAggregate(row) : null;
  }

  async findManyByUser(userId: string, filter: ListFilter): Promise<PaginatedResult<Order>> {
    const where: Prisma.OrderWhereInput = {
      userId,
      ...(filter.cursor ? this.cursorWhere(filter.cursor) : {}),
    };

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });

    return this.paginate(rows, filter.limit, (row) => this.toOrderEntity(row));
  }

  async findSubOrderById(subOrderId: string): Promise<SubOrderWithItems | null> {
    const row = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
      include: { items: true },
    });
    if (!row) return null;
    return {
      subOrder: this.toSubOrderEntity(row),
      items: row.items.map((item) => this.toOrderItemEntity(item)),
    };
  }

  async findManyBySeller(
    sellerId: string,
    filter: ListFilter & { status?: SubOrderStatus },
  ): Promise<PaginatedResult<SubOrder>> {
    const where: Prisma.SubOrderWhereInput = {
      sellerId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.cursor ? this.cursorWhere(filter.cursor) : {}),
    };

    const rows = await this.prisma.subOrder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });

    return this.paginate(rows, filter.limit, (row) => this.toSubOrderEntity(row));
  }

  // ---------- cancelamento ----------

  async cancelOrder(
    orderId: string,
    cancelReason: string,
    initiatedBy: CancelInitiator,
  ): Promise<{ cancelled: boolean; blocked: boolean; subOrderIds: string[] }> {
    return this.prisma.$transaction((tx) => this.performCancel(tx, orderId, cancelReason, initiatedBy));
  }

  async cancelOrderForEvent(
    eventId: string,
    eventType: string,
    orderId: string,
    cancelReason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;
      await this.performCancel(tx, orderId, cancelReason, 'SYSTEM');
      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  // ---------- inventory-events ----------

  async recordStockReserved(
    eventId: string,
    eventType: string,
    subOrderId: string,
    orderId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;

      const subOrder = await tx.subOrder.findUnique({ where: { id: subOrderId } });
      if (subOrder && !subOrder.stockReservedAt) {
        await tx.subOrder.update({ where: { id: subOrderId }, data: { stockReservedAt: new Date() } });
      }

      if (subOrder) {
        await this.maybeMarkSubOrderReady(tx, subOrderId);
        await this.maybeTransitionOrderToReadyForPayment(tx, orderId);
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  async recordStockReservationFailed(
    eventId: string,
    eventType: string,
    subOrderId: string,
    orderId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;
      await this.performCancel(
        tx,
        orderId,
        `Stock reservation failed for subOrder ${subOrderId}: ${reason}`,
        'SYSTEM',
      );
      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  async recordStockReleased(
    eventId: string,
    eventType: string,
    subOrderId: string,
    reason: ReleaseReason,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;

      // PAYMENT_FAILED/ORDER_CANCELLED são confirmação de algo que o order-service já iniciou —
      // no-op (evita re-cancelar em loop). Só EXPIRED (job de TTL do inventory) é notícia nova.
      if (reason === 'EXPIRED') {
        const subOrder = await tx.subOrder.findUnique({ where: { id: subOrderId } });
        if (subOrder) {
          await this.performCancel(tx, subOrder.orderId, 'Stock reservation expired', 'SYSTEM');
        }
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  // ---------- shipping-events ----------

  async recordFreightQuoted(
    eventId: string,
    eventType: string,
    subOrderId: string,
    orderId: string,
    shippingAmount: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;

      const subOrder = await tx.subOrder.findUnique({ where: { id: subOrderId } });
      if (subOrder && !subOrder.freightQuotedAt) {
        await tx.subOrder.update({
          where: { id: subOrderId },
          data: { freightQuotedAt: new Date(), shippingAmount },
        });
      }

      if (subOrder) {
        await this.maybeMarkSubOrderReady(tx, subOrderId);
        await this.maybeTransitionOrderToReadyForPayment(tx, orderId);
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  async recordFreightQuoteFailed(
    eventId: string,
    eventType: string,
    subOrderId: string,
    orderId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;
      await this.performCancel(
        tx,
        orderId,
        `Freight quote failed for subOrder ${subOrderId}: ${reason}`,
        'SYSTEM',
      );
      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  async recordShipmentDispatched(eventId: string, eventType: string, subOrderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;
      await tx.subOrder.updateMany({
        where: { id: subOrderId, status: { notIn: ['CANCELLED', 'REFUNDED', 'DELIVERED'] } },
        data: { status: 'SHIPPED' },
      });
      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  async recordShipmentDelivered(eventId: string, eventType: string, subOrderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;

      const updated = await tx.subOrder.updateMany({
        where: { id: subOrderId, status: { not: 'CANCELLED' } },
        data: { status: 'DELIVERED' },
      });

      if (updated.count === 1) {
        const subOrder = await tx.subOrder.findUniqueOrThrow({ where: { id: subOrderId } });
        const order = await tx.order.findUniqueOrThrow({
          where: { id: subOrder.orderId },
          include: { subOrders: true },
        });
        const allDelivered = order.subOrders.every((so) => so.status === 'DELIVERED');
        if (allDelivered) {
          await tx.order.updateMany({
            where: { id: order.id, status: { not: 'COMPLETED' } },
            data: { status: 'COMPLETED' },
          });
        }
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  // ---------- payment-events ----------

  async recordPaymentConfirmed(
    eventId: string,
    eventType: string,
    orderId: string,
    subOrderIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;

      await tx.order.updateMany({
        where: { id: orderId, status: { not: 'CANCELLED' } },
        data: { status: 'PAID' },
      });

      if (subOrderIds.length > 0) {
        await tx.subOrder.updateMany({
          where: { id: { in: subOrderIds }, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
          data: { status: 'PAYMENT_CONFIRMED' },
        });
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  async recordPaymentFailed(eventId: string, eventType: string, orderId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;
      await this.performCancel(tx, orderId, `Payment failed: ${reason}`, 'SYSTEM');
      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  async recordPaymentRefunded(eventId: string, eventType: string, subOrderIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (await this.alreadyProcessed(tx, eventId)) return;
      if (subOrderIds.length > 0) {
        await tx.subOrder.updateMany({ where: { id: { in: subOrderIds } }, data: { status: 'REFUNDED' } });
      }
      await tx.processedEvent.create({ data: { eventId, eventType } });
    });
  }

  // ---------- privado: agregação da saga ----------

  // Reavalia o SubOrder DENTRO da transação que acabou de setar um dos dois carimbos — o
  // `findUnique` aqui enxerga o próprio write acima (read-your-writes) e, crucialmente, também
  // enxerga o write de uma transação CONCORRENTE já committed pro mesmo SubOrder: como ambos os
  // handlers fazem `UPDATE` na mesma linha, o Postgres serializa via lock de linha — quem roda
  // por último aqui é sempre quem detecta "os dois carimbos estão setados".
  private async maybeMarkSubOrderReady(tx: Tx, subOrderId: string): Promise<void> {
    const subOrder = await tx.subOrder.findUniqueOrThrow({ where: { id: subOrderId } });
    if (subOrder.status === 'PENDING' && subOrder.stockReservedAt && subOrder.freightQuotedAt) {
      await tx.subOrder.update({ where: { id: subOrderId }, data: { status: 'READY' } });
    }
  }

  // Exactly-once: só publica `OrderReadyForPayment` se o `updateMany` condicional
  // (`status: PENDING`) realmente afetou 1 linha. Duas SubOrders concluindo por último ao mesmo
  // tempo corridamente tentam essa transição — a que perder o lock da linha Order roda depois,
  // vê `status != PENDING` e o updateMany conta 0.
  private async maybeTransitionOrderToReadyForPayment(tx: Tx, orderId: string): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { subOrders: true },
    });

    const allReady = order.subOrders.length > 0 && order.subOrders.every((so) => so.status === 'READY');
    if (!allReady) return;

    const totalDecimal = order.subOrders.reduce(
      (acc, so) => acc.plus(so.subtotalAmount).plus(so.shippingAmount ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    const totalAmount = totalDecimal.toFixed(2);

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING' },
      data: { status: 'READY_FOR_PAYMENT', totalAmount },
    });
    if (updated.count !== 1) return;

    await tx.outboxEvent.create({
      data: {
        aggregateType: AGGREGATE_TYPE,
        aggregateId: orderId,
        eventType: 'OrderReadyForPayment',
        payload: {
          orderId,
          userId: order.userId,
          totalAmount,
          subOrders: order.subOrders.map((so) => ({
            subOrderId: so.id,
            sellerId: so.sellerId,
            subtotalAmount: so.subtotalAmount.toFixed(2),
            shippingAmount: (so.shippingAmount ?? new Prisma.Decimal(0)).toFixed(2),
            status: 'READY',
          })),
        },
      },
    });
  }

  // ---------- privado: cancelamento compartilhado (API + compensação) ----------

  private async performCancel(
    tx: Tx,
    orderId: string,
    cancelReason: string,
    initiatedBy: CancelInitiator,
  ): Promise<{ cancelled: boolean; blocked: boolean; subOrderIds: string[] }> {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { subOrders: true } });
    if (!order) return { cancelled: false, blocked: false, subOrderIds: [] };
    if (order.status === 'CANCELLED') return { cancelled: false, blocked: false, subOrderIds: [] };

    const hasShipped = order.subOrders.some((so) =>
      BLOCKING_CANCEL_STATUSES.includes(so.status as SubOrderStatus),
    );
    if (hasShipped) return { cancelled: false, blocked: true, subOrderIds: [] };

    const affected = order.subOrders.filter(
      (so) => !TERMINAL_SUBORDER_STATUSES.includes(so.status as SubOrderStatus),
    );
    const subOrderIds = affected.map((so) => so.id);

    // Guard condicional: protege de corrida entre `cancelOrder` (API) e uma compensação de
    // evento concorrente (ex: PaymentFailed chegando junto com o clique de cancelar do cliente).
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED' },
    });
    if (updated.count !== 1) return { cancelled: false, blocked: false, subOrderIds: [] };

    if (subOrderIds.length > 0) {
      await tx.subOrder.updateMany({
        where: { id: { in: subOrderIds } },
        data: { status: 'CANCELLED', cancelReason },
      });
    }

    await tx.outboxEvent.create({
      data: {
        aggregateType: AGGREGATE_TYPE,
        aggregateId: orderId,
        eventType: 'OrderCancelled',
        payload: { orderId, userId: order.userId, subOrderIds, cancelReason, initiatedBy },
      },
    });

    return { cancelled: true, blocked: false, subOrderIds };
  }

  // ---------- privado: inbox / paginação / mapeamento ----------

  private async alreadyProcessed(tx: Tx, eventId: string): Promise<boolean> {
    return (await tx.processedEvent.findUnique({ where: { eventId } })) !== null;
  }

  private paginate<TRow extends { createdAt: Date; id: string }, TEntity>(
    rows: TRow[],
    limit: number,
    toEntity: (row: TRow) => TEntity,
  ): PaginatedResult<TEntity> {
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((row) => toEntity(row)),
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }

  private cursorWhere(cursor: string): { OR: Record<string, unknown>[] } {
    const decoded = this.decodeCursor(cursor);
    return {
      OR: [
        { createdAt: { lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, id: { lt: decoded.id } },
      ],
    };
  }

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    const payload: Cursor = { createdAt: row.createdAt.toISOString(), id: row.id };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor;
    return { createdAt: new Date(decoded.createdAt), id: decoded.id };
  }

  private toAggregate(row: PrismaOrderWithSubOrders): OrderWithSubOrders {
    return {
      order: this.toOrderEntity(row),
      subOrders: row.subOrders.map((subOrder) => ({
        subOrder: this.toSubOrderEntity(subOrder),
        items: subOrder.items.map((item) => this.toOrderItemEntity(item)),
      })),
    };
  }

  private toOrderEntity(row: PrismaOrder): Order {
    return new Order({
      id: row.id,
      userId: row.userId,
      addressId: row.addressId,
      status: row.status,
      totalAmount: row.totalAmount.toFixed(2),
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toSubOrderEntity(row: PrismaSubOrder): SubOrder {
    return new SubOrder({
      id: row.id,
      orderId: row.orderId,
      sellerId: row.sellerId,
      status: row.status,
      subtotalAmount: row.subtotalAmount.toFixed(2),
      shippingAmount: row.shippingAmount ? row.shippingAmount.toFixed(2) : null,
      stockReservedAt: row.stockReservedAt,
      freightQuotedAt: row.freightQuotedAt,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toOrderItemEntity(row: PrismaOrderItem): OrderItem {
    return new OrderItem({
      id: row.id,
      subOrderId: row.subOrderId,
      variantId: row.variantId,
      skuSnapshot: row.skuSnapshot,
      titleSnapshot: row.titleSnapshot,
      unitPriceSnapshot: row.unitPriceSnapshot.toFixed(2),
      quantity: row.quantity,
      weightGramsSnapshot: row.weightGramsSnapshot,
      createdAt: row.createdAt,
    });
  }
}
