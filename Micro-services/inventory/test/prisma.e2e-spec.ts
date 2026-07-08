import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('inventory-db schema', () => {
  let prisma: PrismaService;
  const createdStockItemIds: string[] = [];
  const createdReservationIds: string[] = [];
  const createdProcessedEventIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.processedEvent.deleteMany({ where: { id: { in: createdProcessedEventIds } } });
    await prisma.stockReservation.deleteMany({ where: { id: { in: createdReservationIds } } });
    await prisma.stockItem.deleteMany({ where: { id: { in: createdStockItemIds } } });
    await prisma.onModuleDestroy();
  });

  it('reserves stock against a StockItem', async () => {
    const variantId = randomUUID();
    const stockItem = await prisma.stockItem.create({
      data: { variantId, sellerId: randomUUID(), quantity: 10 },
    });
    createdStockItemIds.push(stockItem.id);

    const reservation = await prisma.stockReservation.create({
      data: {
        variantId,
        subOrderId: randomUUID(),
        quantity: 3,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    createdReservationIds.push(reservation.id);
    expect(reservation.status).toBe('PENDING');

    const updated = await prisma.stockItem.update({
      where: { id: stockItem.id },
      data: { reservedQty: { increment: reservation.quantity } },
    });
    expect(updated.quantity - updated.reservedQty).toBe(7);
  });

  it('rejects a duplicate variantId in StockItem', async () => {
    const variantId = randomUUID();
    const stockItem = await prisma.stockItem.create({
      data: { variantId, sellerId: randomUUID(), quantity: 5 },
    });
    createdStockItemIds.push(stockItem.id);

    await expect(
      prisma.stockItem.create({ data: { variantId, sellerId: randomUUID(), quantity: 1 } }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate ProcessedEvent eventId', async () => {
    const eventId = randomUUID();
    const processed = await prisma.processedEvent.create({
      data: { eventId, eventType: 'OrderCreated' },
    });
    createdProcessedEventIds.push(processed.id);

    await expect(
      prisma.processedEvent.create({ data: { eventId, eventType: 'OrderCreated' } }),
    ).rejects.toThrow();
  });
});
