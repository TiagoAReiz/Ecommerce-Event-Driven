import { StockReservationRepository } from './stock-reservation.repository';

function buildTx() {
  return {
    processedEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    stockItem: { findUnique: jest.fn(), update: jest.fn() },
    stockReservation: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: { create: jest.fn() },
  };
}

function buildRepo(tx = buildTx()) {
  const prisma = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    outboxEvent: { findMany: jest.fn() },
  } as any;
  return { repo: new StockReservationRepository(prisma), prisma, tx };
}

describe('StockReservationRepository', () => {
  describe('reserveForOrder', () => {
    it('reserves all items of a subOrder (reservedQty += q, PENDING rows) and emits StockReserved', async () => {
      const tx = buildTx();
      tx.stockItem.findUnique.mockResolvedValue({ quantity: 10, reservedQty: 0 });
      tx.stockReservation.create
        .mockResolvedValueOnce({ id: 'res-1' })
        .mockResolvedValueOnce({ id: 'res-2' });
      const { repo } = buildRepo(tx);

      await repo.reserveForOrder(
        'evt-1',
        'OrderCreated',
        {
          orderId: 'order-1',
          subOrders: [
            {
              subOrderId: 'sub-1',
              items: [
                { variantId: 'v-1', quantity: 2 },
                { variantId: 'v-2', quantity: 3 },
              ],
            },
          ],
        },
        new Date('2026-07-11T10:15:00.000Z'),
      );

      expect(tx.stockItem.update).toHaveBeenCalledWith({
        where: { variantId: 'v-1' },
        data: { reservedQty: { increment: 2 } },
      });
      expect(tx.stockItem.update).toHaveBeenCalledWith({
        where: { variantId: 'v-2' },
        data: { reservedQty: { increment: 3 } },
      });
      expect(tx.stockReservation.create).toHaveBeenCalledTimes(2);
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'StockReservation',
          aggregateId: 'sub-1',
          eventType: 'StockReserved',
          payload: {
            subOrderId: 'sub-1',
            orderId: 'order-1',
            reservations: [
              { variantId: 'v-1', quantity: 2, reservationId: 'res-1' },
              { variantId: 'v-2', quantity: 3, reservationId: 'res-2' },
            ],
          },
        },
      });
      expect(tx.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-1', eventType: 'OrderCreated' },
      });
    });

    it('fails the whole subOrder (all-or-nothing) and emits StockReservationFailed when one item is short', async () => {
      const tx = buildTx();
      tx.stockItem.findUnique
        .mockResolvedValueOnce({ quantity: 10, reservedQty: 0 }) // v-1 ok
        .mockResolvedValueOnce({ quantity: 1, reservedQty: 0 }); // v-2 short
      const { repo } = buildRepo(tx);

      await repo.reserveForOrder(
        'evt-1',
        'OrderCreated',
        {
          orderId: 'order-1',
          subOrders: [
            {
              subOrderId: 'sub-1',
              items: [
                { variantId: 'v-1', quantity: 2 },
                { variantId: 'v-2', quantity: 3 },
              ],
            },
          ],
        },
        new Date(),
      );

      expect(tx.stockItem.update).not.toHaveBeenCalled();
      expect(tx.stockReservation.create).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'StockReservation',
          aggregateId: 'sub-1',
          eventType: 'StockReservationFailed',
          payload: {
            subOrderId: 'sub-1',
            orderId: 'order-1',
            failedItems: [{ variantId: 'v-2', requestedQty: 3, availableQty: 1 }],
          },
        },
      });
    });

    it('treats an untracked variant as availableQty 0', async () => {
      const tx = buildTx();
      tx.stockItem.findUnique.mockResolvedValue(null);
      const { repo } = buildRepo(tx);

      await repo.reserveForOrder(
        'evt-1',
        'OrderCreated',
        { orderId: 'order-1', subOrders: [{ subOrderId: 'sub-1', items: [{ variantId: 'v-x', quantity: 1 }] }] },
        new Date(),
      );

      expect(tx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'StockReservationFailed',
            payload: expect.objectContaining({
              failedItems: [{ variantId: 'v-x', requestedQty: 1, availableQty: 0 }],
            }),
          }),
        }),
      );
    });

    it('is a no-op (inbox dedupe) when the eventId was already processed', async () => {
      const tx = buildTx();
      tx.processedEvent.findUnique.mockResolvedValue({ id: 'p-1', eventId: 'evt-1' });
      const { repo } = buildRepo(tx);

      await repo.reserveForOrder(
        'evt-1',
        'OrderCreated',
        { orderId: 'order-1', subOrders: [{ subOrderId: 'sub-1', items: [{ variantId: 'v-1', quantity: 1 }] }] },
        new Date(),
      );

      expect(tx.stockItem.findUnique).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
      expect(tx.processedEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmForSubOrders', () => {
    it('debits quantity and reservedQty and marks reservations CONFIRMED, no outbox event', async () => {
      const tx = buildTx();
      tx.stockReservation.findMany.mockResolvedValue([
        { id: 'res-1', variantId: 'v-1', quantity: 2 },
      ]);
      const { repo } = buildRepo(tx);

      await repo.confirmForSubOrders('evt-1', 'PaymentConfirmed', ['sub-1']);

      expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({
        where: { id: 'res-1', status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });
      expect(tx.stockItem.update).toHaveBeenCalledWith({
        where: { variantId: 'v-1' },
        data: { quantity: { decrement: 2 }, reservedQty: { decrement: 2 } },
      });
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
      expect(tx.processedEvent.create).toHaveBeenCalled();
    });

    it('skips the stock debit when the reservation is no longer PENDING (idempotent)', async () => {
      const tx = buildTx();
      tx.stockReservation.findMany.mockResolvedValue([{ id: 'res-1', variantId: 'v-1', quantity: 2 }]);
      tx.stockReservation.updateMany.mockResolvedValue({ count: 0 });
      const { repo } = buildRepo(tx);

      await repo.confirmForSubOrders('evt-1', 'PaymentConfirmed', ['sub-1']);

      expect(tx.stockItem.update).not.toHaveBeenCalled();
    });
  });

  describe('releaseSubOrders', () => {
    it('releases reservedQty, marks RELEASED and emits one StockReleased per subOrder with the reason', async () => {
      const tx = buildTx();
      tx.stockReservation.findMany.mockResolvedValue([
        { id: 'res-1', variantId: 'v-1', quantity: 2 },
      ]);
      const { repo } = buildRepo(tx);

      await repo.releaseSubOrders('evt-1', 'OrderCancelled', ['sub-1'], 'ORDER_CANCELLED');

      expect(tx.stockItem.update).toHaveBeenCalledWith({
        where: { variantId: 'v-1' },
        data: { reservedQty: { decrement: 2 } },
      });
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'StockReservation',
          aggregateId: 'sub-1',
          eventType: 'StockReleased',
          payload: {
            subOrderId: 'sub-1',
            releasedItems: [{ variantId: 'v-1', quantity: 2 }],
            reason: 'ORDER_CANCELLED',
          },
        },
      });
    });

    it('emits no StockReleased for a subOrder with nothing PENDING (idempotent double-release)', async () => {
      const tx = buildTx();
      tx.stockReservation.findMany.mockResolvedValue([]);
      const { repo } = buildRepo(tx);

      await repo.releaseSubOrders('evt-1', 'PaymentFailed', ['sub-1'], 'PAYMENT_FAILED');

      expect(tx.stockItem.update).not.toHaveBeenCalled();
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
      expect(tx.processedEvent.create).toHaveBeenCalled(); // still records the inbox row
    });
  });

  describe('findReservedSubOrderIdsByOrderId', () => {
    it('returns the distinct subOrderIds from persisted StockReserved outbox events', async () => {
      const { repo, prisma } = buildRepo();
      prisma.outboxEvent.findMany.mockResolvedValue([
        { aggregateId: 'sub-1' },
        { aggregateId: 'sub-2' },
        { aggregateId: 'sub-1' },
      ]);

      const result = await repo.findReservedSubOrderIdsByOrderId('order-1');

      expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
        where: { eventType: 'StockReserved', payload: { path: ['orderId'], equals: 'order-1' } },
        select: { aggregateId: true },
      });
      expect(result).toEqual(['sub-1', 'sub-2']);
    });
  });

  describe('expireDueReservations', () => {
    it('releases expired PENDING reservations and emits StockReleased reason EXPIRED per subOrder', async () => {
      const tx = buildTx();
      tx.stockReservation.findMany.mockResolvedValue([
        { id: 'res-1', variantId: 'v-1', quantity: 2, subOrderId: 'sub-1' },
        { id: 'res-2', variantId: 'v-2', quantity: 1, subOrderId: 'sub-1' },
      ]);
      const { repo } = buildRepo(tx);

      const count = await repo.expireDueReservations(new Date('2026-07-11T11:00:00.000Z'));

      expect(count).toBe(2);
      expect(tx.stockItem.update).toHaveBeenCalledTimes(2);
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'StockReservation',
          aggregateId: 'sub-1',
          eventType: 'StockReleased',
          payload: {
            subOrderId: 'sub-1',
            releasedItems: [
              { variantId: 'v-1', quantity: 2 },
              { variantId: 'v-2', quantity: 1 },
            ],
            reason: 'EXPIRED',
          },
        },
      });
    });

    it('returns 0 and emits nothing when no reservation is due', async () => {
      const tx = buildTx();
      tx.stockReservation.findMany.mockResolvedValue([]);
      const { repo } = buildRepo(tx);

      const count = await repo.expireDueReservations(new Date());

      expect(count).toBe(0);
      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    });
  });
});
