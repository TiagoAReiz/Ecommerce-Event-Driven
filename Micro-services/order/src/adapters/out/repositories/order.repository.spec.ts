import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { OrderRepository } from './order.repository';

/**
 * Fake Prisma mínimo, em memória — implementa só as chamadas que order.repository.ts
 * realmente faz (create/findUnique/findUniqueOrThrow/findMany/updateMany + `$transaction`),
 * com semântica equivalente ao Postgres real onde importa pros testes abaixo:
 *   - `updateMany({ where: { status: X } })` só afeta a linha se o status atual bater (mesmo
 *     guard condicional usado pelo código real pra exactly-once / idempotência de dupla-ação).
 *   - `(userId, idempotencyKey)` duplicado lança um erro com `code: 'P2002'`, como o Postgres.
 *
 * NÃO simula lock de linha / concorrência real do Postgres (não há banco nos testes deste
 * pacote) — o que fica provado aqui é que a LÓGICA de agregação (exactly-once, compensação,
 * inbox) está correta dado um histórico de chamadas, inclusive quando o mesmo evento é
 * entregue duas vezes. A garantia de que duas transações CONCORRENTES de fato serializam via
 * row lock do Postgres é uma propriedade do banco, não testável sem ele.
 */
function buildFakePrisma() {
  const db = {
    orders: new Map<string, any>(),
    subOrders: new Map<string, any>(),
    outboxEvents: [] as any[],
    processedEvents: new Map<string, any>(),
  };

  function statusMatches(rowStatus: string, cond: unknown): boolean {
    if (cond === undefined) return true;
    if (typeof cond === 'string') return rowStatus === cond;
    const c = cond as { not?: string; notIn?: string[] };
    if (c.not !== undefined) return rowStatus !== c.not;
    if (c.notIn !== undefined) return !c.notIn.includes(rowStatus);
    return true;
  }

  function idMatches(rowId: string, cond: unknown): boolean {
    if (typeof cond === 'string') return rowId === cond;
    const c = cond as { in?: string[] };
    if (c?.in) return c.in.includes(rowId);
    return false;
  }

  function orderWithSubOrders(orderRow: any) {
    const subOrders = [...db.subOrders.values()]
      .filter((so) => so.orderId === orderRow.id)
      .map((so) => ({ ...so, items: [] }));
    return { ...orderRow, subOrders };
  }

  const tx = {
    order: {
      create: (args: any) => {
        const { subOrders, ...orderData } = args.data;
        const now = new Date();
        if (orderData.idempotencyKey != null) {
          const dup = [...db.orders.values()].find(
            (o) => o.userId === orderData.userId && o.idempotencyKey === orderData.idempotencyKey,
          );
          if (dup) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`userId`,`idempotencyKey`)',
              { code: 'P2002', clientVersion: 'test' },
            );
          }
        }
        const row = {
          id: orderData.id,
          userId: orderData.userId,
          addressId: orderData.addressId,
          status: 'PENDING',
          totalAmount: new Prisma.Decimal(orderData.totalAmount),
          idempotencyKey: orderData.idempotencyKey ?? null,
          createdAt: now,
          updatedAt: now,
        };
        db.orders.set(row.id, row);

        const subOrderRows: any[] = [];
        for (const so of subOrders?.create ?? []) {
          const { items, ...soData } = so;
          const soRow = {
            id: soData.id,
            orderId: row.id,
            sellerId: soData.sellerId,
            status: 'PENDING',
            subtotalAmount: new Prisma.Decimal(soData.subtotalAmount),
            shippingAmount: null,
            stockReservedAt: null,
            freightQuotedAt: null,
            cancelReason: null,
            createdAt: now,
            updatedAt: now,
          };
          db.subOrders.set(soRow.id, soRow);
          const itemRows = (items?.create ?? []).map((item: any) => ({
            id: randomUUID(),
            subOrderId: soRow.id,
            ...item,
            unitPriceSnapshot: new Prisma.Decimal(item.unitPriceSnapshot),
          }));
          subOrderRows.push({ ...soRow, items: itemRows });
        }

        return { ...row, subOrders: subOrderRows };
      },
      findUnique: (args: any) => {
        let row: any;
        if (args.where.id) {
          row = db.orders.get(args.where.id);
        } else if (args.where.userId_idempotencyKey) {
          const { userId, idempotencyKey } = args.where.userId_idempotencyKey;
          row = [...db.orders.values()].find((o) => o.userId === userId && o.idempotencyKey === idempotencyKey);
        }
        if (!row) return null;
        const withSubOrders = orderWithSubOrders(row);
        withSubOrders.subOrders = withSubOrders.subOrders.map((so: any) => ({ ...so, items: [] }));
        return withSubOrders;
      },
      findUniqueOrThrow: (args: any) => {
        const row = tx.order.findUnique(args);
        if (!row) throw new Error('Order not found');
        return row;
      },
      updateMany: (args: any) => {
        const row = db.orders.get(args.where.id);
        if (!row || !statusMatches(row.status, args.where.status)) return { count: 0 };
        const data = { ...args.data };
        if (typeof data.totalAmount === 'string') data.totalAmount = new Prisma.Decimal(data.totalAmount);
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    subOrder: {
      findUnique: (args: any) => {
        const row = db.subOrders.get(args.where.id);
        return row ? { ...row } : null;
      },
      findUniqueOrThrow: (args: any) => {
        const row = tx.subOrder.findUnique(args);
        if (!row) throw new Error('SubOrder not found');
        return row;
      },
      update: (args: any) => {
        const row = db.subOrders.get(args.where.id);
        if (!row) throw new Error('SubOrder not found');
        const data = { ...args.data };
        if (typeof data.shippingAmount === 'string') data.shippingAmount = new Prisma.Decimal(data.shippingAmount);
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: (args: any) => {
        const rows = [...db.subOrders.values()].filter(
          (so) => idMatches(so.id, args.where.id) && statusMatches(so.status, args.where.status),
        );
        for (const row of rows) Object.assign(row, args.data);
        return { count: rows.length };
      },
    },
    outboxEvent: {
      create: (args: any) => {
        const row = { id: randomUUID(), status: 'PENDING', createdAt: new Date(), ...args.data };
        db.outboxEvents.push(row);
        return row;
      },
    },
    processedEvent: {
      findUnique: (args: any) => db.processedEvents.get(args.where.eventId) ?? null,
      create: (args: any) => {
        const row = { id: randomUUID(), processedAt: new Date(), ...args.data };
        db.processedEvents.set(args.data.eventId, row);
        return row;
      },
    },
  };

  const prisma = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
  };

  return { prisma, db };
}

describe('OrderRepository', () => {
  describe('createOrder', () => {
    it('creates Order+SubOrder+OrderItem and writes an OrderCreated outbox row', async () => {
      const { prisma, db } = buildFakePrisma();
      const repository = new OrderRepository(prisma as any);

      const { order, created } = await repository.createOrder({
        id: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        idempotencyKey: 'idem-1',
        totalAmount: '100.00',
        subOrders: [
          {
            id: 'sub-1',
            sellerId: 'seller-1',
            subtotalAmount: '100.00',
            items: [
              {
                variantId: 'v-1',
                sku: 'SKU-1',
                title: 'Fone',
                unitPrice: '100.00',
                quantity: 1,
                weightGrams: 200,
              },
            ],
          },
        ],
        outboxPayload: { orderId: 'order-1', userId: 'user-1', addressId: 'addr-1', subOrders: [] },
      });

      expect(created).toBe(true);
      expect(order.order.id).toBe('order-1');
      expect(order.subOrders).toHaveLength(1);
      expect(db.outboxEvents).toHaveLength(1);
      expect(db.outboxEvents[0].eventType).toBe('OrderCreated');
      expect(db.outboxEvents[0].aggregateId).toBe('order-1');
    });

    it('replays the existing Order on a duplicate (userId, idempotencyKey) instead of throwing', async () => {
      const { prisma, db } = buildFakePrisma();
      const repository = new OrderRepository(prisma as any);
      const input = {
        id: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        idempotencyKey: 'idem-1',
        totalAmount: '50.00',
        subOrders: [],
        outboxPayload: {},
      };

      await repository.createOrder(input);
      const secondAttempt = await repository.createOrder({ ...input, id: 'order-2', totalAmount: '999.00' });

      expect(secondAttempt.created).toBe(false);
      expect(secondAttempt.order.order.id).toBe('order-1');
      expect(secondAttempt.order.order.totalAmount).toBe('50.00');
      // Só o outbox da primeira criação foi escrito — a segunda tentativa não duplicou o evento.
      expect(db.outboxEvents.filter((e) => e.eventType === 'OrderCreated')).toHaveLength(1);
    });
  });

  describe('exactly-once OrderReadyForPayment', () => {
    function seedReadyToResolveOrder(db: ReturnType<typeof buildFakePrisma>['db']) {
      const now = new Date();
      db.orders.set('order-1', {
        id: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        status: 'PENDING',
        totalAmount: new Prisma.Decimal('0'),
        idempotencyKey: null,
        createdAt: now,
        updatedAt: now,
      });
      db.subOrders.set('sub-1', {
        id: 'sub-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        status: 'PENDING',
        subtotalAmount: new Prisma.Decimal('80.00'),
        shippingAmount: null,
        stockReservedAt: null,
        freightQuotedAt: null,
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    it('publishes OrderReadyForPayment exactly once when StockReserved and FreightQuoted both land for the last (only) SubOrder', async () => {
      const { prisma, db } = buildFakePrisma();
      seedReadyToResolveOrder(db);
      const repository = new OrderRepository(prisma as any);

      await repository.recordStockReserved('evt-stock-1', 'StockReserved', 'sub-1', 'order-1');
      // Ainda falta o frete — SubOrder não deve virar READY nem o Order fechar.
      expect(db.subOrders.get('sub-1').status).toBe('PENDING');
      expect(db.orders.get('order-1').status).toBe('PENDING');

      await repository.recordFreightQuoted('evt-freight-1', 'FreightQuoted', 'sub-1', 'order-1', '15.00');

      expect(db.subOrders.get('sub-1').status).toBe('READY');
      expect(db.orders.get('order-1').status).toBe('READY_FOR_PAYMENT');
      expect(db.orders.get('order-1').totalAmount.toFixed(2)).toBe('95.00');

      const readyEvents = db.outboxEvents.filter((e) => e.eventType === 'OrderReadyForPayment');
      expect(readyEvents).toHaveLength(1);
      expect(readyEvents[0].payload.totalAmount).toBe('95.00');
    });

    it('does not publish OrderReadyForPayment twice when the same event is redelivered (inbox dedupe)', async () => {
      const { prisma, db } = buildFakePrisma();
      seedReadyToResolveOrder(db);
      const repository = new OrderRepository(prisma as any);

      await repository.recordStockReserved('evt-stock-1', 'StockReserved', 'sub-1', 'order-1');
      await repository.recordFreightQuoted('evt-freight-1', 'FreightQuoted', 'sub-1', 'order-1', '15.00');
      // Redelivery do MESMO eventId (reentrega do Kafka) — deve ser no-op.
      await repository.recordFreightQuoted('evt-freight-1', 'FreightQuoted', 'sub-1', 'order-1', '15.00');

      const readyEvents = db.outboxEvents.filter((e) => e.eventType === 'OrderReadyForPayment');
      expect(readyEvents).toHaveLength(1);
    });

    it('only fires OrderReadyForPayment once all SubOrders of a multi-seller Order are READY, and exactly once for the one that completes last', async () => {
      const { prisma, db } = buildFakePrisma();
      const now = new Date();
      db.orders.set('order-1', {
        id: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        status: 'PENDING',
        totalAmount: new Prisma.Decimal('0'),
        idempotencyKey: null,
        createdAt: now,
        updatedAt: now,
      });
      for (const id of ['sub-1', 'sub-2']) {
        db.subOrders.set(id, {
          id,
          orderId: 'order-1',
          sellerId: `seller-${id}`,
          status: 'PENDING',
          subtotalAmount: new Prisma.Decimal('50.00'),
          shippingAmount: null,
          stockReservedAt: null,
          freightQuotedAt: null,
          cancelReason: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      const repository = new OrderRepository(prisma as any);

      // sub-1 resolve completamente primeiro.
      await repository.recordStockReserved('evt-1', 'StockReserved', 'sub-1', 'order-1');
      await repository.recordFreightQuoted('evt-2', 'FreightQuoted', 'sub-1', 'order-1', '10.00');
      expect(db.orders.get('order-1').status).toBe('PENDING');
      expect(db.outboxEvents.filter((e) => e.eventType === 'OrderReadyForPayment')).toHaveLength(0);

      // sub-2 resolve por último — é quem deve fechar o Order.
      await repository.recordStockReserved('evt-3', 'StockReserved', 'sub-2', 'order-1');
      await repository.recordFreightQuoted('evt-4', 'FreightQuoted', 'sub-2', 'order-1', '10.00');

      expect(db.orders.get('order-1').status).toBe('READY_FOR_PAYMENT');
      const readyEvents = db.outboxEvents.filter((e) => e.eventType === 'OrderReadyForPayment');
      expect(readyEvents).toHaveLength(1);
      expect(readyEvents[0].payload.totalAmount).toBe('120.00');
      expect(readyEvents[0].payload.subOrders).toHaveLength(2);
    });
  });

  describe('compensação (falhas)', () => {
    function seedTwoSubOrderOrder(db: ReturnType<typeof buildFakePrisma>['db'], overrides: Partial<any> = {}) {
      const now = new Date();
      db.orders.set('order-1', {
        id: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        status: 'PENDING',
        totalAmount: new Prisma.Decimal('0'),
        idempotencyKey: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      });
      db.subOrders.set('sub-1', {
        id: 'sub-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        status: 'READY',
        subtotalAmount: new Prisma.Decimal('50.00'),
        shippingAmount: new Prisma.Decimal('10.00'),
        stockReservedAt: now,
        freightQuotedAt: now,
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
      });
      db.subOrders.set('sub-2', {
        id: 'sub-2',
        orderId: 'order-1',
        sellerId: 'seller-2',
        status: 'PENDING',
        subtotalAmount: new Prisma.Decimal('30.00'),
        shippingAmount: null,
        stockReservedAt: null,
        freightQuotedAt: null,
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    it('StockReservationFailed on one SubOrder cancels the WHOLE order, including the SubOrder that already succeeded', async () => {
      const { prisma, db } = buildFakePrisma();
      seedTwoSubOrderOrder(db);
      const repository = new OrderRepository(prisma as any);

      await repository.recordStockReservationFailed('evt-fail-1', 'StockReservationFailed', 'sub-2', 'order-1', 'out of stock');

      expect(db.orders.get('order-1').status).toBe('CANCELLED');
      // sub-1 já tinha reservado com sucesso (status READY) — precisa ser cancelado também, pra
      // que o OrderCancelled alcance o inventory e libere a reserva.
      expect(db.subOrders.get('sub-1').status).toBe('CANCELLED');
      expect(db.subOrders.get('sub-2').status).toBe('CANCELLED');

      const cancelEvents = db.outboxEvents.filter((e) => e.eventType === 'OrderCancelled');
      expect(cancelEvents).toHaveLength(1);
      expect(cancelEvents[0].payload.subOrderIds.sort()).toEqual(['sub-1', 'sub-2']);
      expect(cancelEvents[0].payload.initiatedBy).toBe('SYSTEM');
    });

    it('is idempotent by eventId: redelivering the same failure event does not cancel/publish twice', async () => {
      const { prisma, db } = buildFakePrisma();
      seedTwoSubOrderOrder(db);
      const repository = new OrderRepository(prisma as any);

      await repository.recordStockReservationFailed('evt-fail-1', 'StockReservationFailed', 'sub-2', 'order-1', 'out of stock');
      await repository.recordStockReservationFailed('evt-fail-1', 'StockReservationFailed', 'sub-2', 'order-1', 'out of stock');

      expect(db.outboxEvents.filter((e) => e.eventType === 'OrderCancelled')).toHaveLength(1);
    });

    it('recordPaymentFailed cancels the whole order', async () => {
      const { prisma, db } = buildFakePrisma();
      seedTwoSubOrderOrder(db, { status: 'READY_FOR_PAYMENT' });
      const repository = new OrderRepository(prisma as any);

      await repository.recordPaymentFailed('evt-pay-fail', 'PaymentFailed', 'order-1', 'card declined');

      expect(db.orders.get('order-1').status).toBe('CANCELLED');
      const cancelEvents = db.outboxEvents.filter((e) => e.eventType === 'OrderCancelled');
      expect(cancelEvents).toHaveLength(1);
      expect(cancelEvents[0].payload.cancelReason).toContain('card declined');
    });

    it('recordStockReleased with reason EXPIRED cancels the order; PAYMENT_FAILED/ORDER_CANCELLED reasons no-op', async () => {
      const { prisma, db } = buildFakePrisma();
      seedTwoSubOrderOrder(db);
      const repository = new OrderRepository(prisma as any);

      await repository.recordStockReleased('evt-rel-1', 'StockReleased', 'sub-2', 'ORDER_CANCELLED');
      expect(db.orders.get('order-1').status).toBe('PENDING');
      expect(db.outboxEvents.filter((e) => e.eventType === 'OrderCancelled')).toHaveLength(0);

      await repository.recordStockReleased('evt-rel-2', 'StockReleased', 'sub-2', 'EXPIRED');
      expect(db.orders.get('order-1').status).toBe('CANCELLED');
      expect(db.outboxEvents.filter((e) => e.eventType === 'OrderCancelled')).toHaveLength(1);
    });
  });

  describe('cancelOrder (API)', () => {
    it('blocks cancellation once any SubOrder has SHIPPED', async () => {
      const { prisma, db } = buildFakePrisma();
      const now = new Date();
      db.orders.set('order-1', {
        id: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        status: 'PAID',
        totalAmount: new Prisma.Decimal('50.00'),
        idempotencyKey: null,
        createdAt: now,
        updatedAt: now,
      });
      db.subOrders.set('sub-1', {
        id: 'sub-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        status: 'SHIPPED',
        subtotalAmount: new Prisma.Decimal('50.00'),
        shippingAmount: new Prisma.Decimal('10.00'),
        stockReservedAt: now,
        freightQuotedAt: now,
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
      });
      const repository = new OrderRepository(prisma as any);

      const result = await repository.cancelOrder('order-1', 'changed my mind', 'CUSTOMER');

      expect(result.blocked).toBe(true);
      expect(result.cancelled).toBe(false);
      expect(db.orders.get('order-1').status).toBe('PAID');
      expect(db.outboxEvents.filter((e) => e.eventType === 'OrderCancelled')).toHaveLength(0);
    });

    it('cancels non-terminal SubOrders and is idempotent on retry', async () => {
      const { prisma, db } = buildFakePrisma();
      const now = new Date();
      db.orders.set('order-1', {
        id: 'order-1',
        userId: 'user-1',
        addressId: 'addr-1',
        status: 'READY_FOR_PAYMENT',
        totalAmount: new Prisma.Decimal('50.00'),
        idempotencyKey: null,
        createdAt: now,
        updatedAt: now,
      });
      db.subOrders.set('sub-1', {
        id: 'sub-1',
        orderId: 'order-1',
        sellerId: 'seller-1',
        status: 'READY',
        subtotalAmount: new Prisma.Decimal('50.00'),
        shippingAmount: new Prisma.Decimal('10.00'),
        stockReservedAt: now,
        freightQuotedAt: now,
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
      });
      const repository = new OrderRepository(prisma as any);

      const first = await repository.cancelOrder('order-1', 'changed my mind', 'CUSTOMER');
      expect(first.cancelled).toBe(true);
      expect(db.subOrders.get('sub-1').status).toBe('CANCELLED');

      const second = await repository.cancelOrder('order-1', 'changed my mind', 'CUSTOMER');
      expect(second.cancelled).toBe(false);
      expect(second.blocked).toBe(false);
      expect(db.outboxEvents.filter((e) => e.eventType === 'OrderCancelled')).toHaveLength(1);
    });
  });
});
