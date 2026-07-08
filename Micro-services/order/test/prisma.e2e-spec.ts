import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('order-db schema', () => {
  let prisma: PrismaService;
  const createdOrderIds: string[] = [];
  const createdSubOrderIds: string[] = [];
  const createdItemIds: string[] = [];
  const createdProcessedEventIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.processedEvent.deleteMany({ where: { id: { in: createdProcessedEventIds } } });
    await prisma.orderItem.deleteMany({ where: { id: { in: createdItemIds } } });
    await prisma.subOrder.deleteMany({ where: { id: { in: createdSubOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.onModuleDestroy();
  });

  it('creates an Order -> SubOrder -> OrderItem chain', async () => {
    const order = await prisma.order.create({
      data: { userId: randomUUID(), addressId: randomUUID(), totalAmount: '259.80' },
    });
    createdOrderIds.push(order.id);
    expect(order.status).toBe('PENDING');

    const subOrder = await prisma.subOrder.create({
      data: { orderId: order.id, sellerId: randomUUID(), subtotalAmount: '259.80' },
    });
    createdSubOrderIds.push(subOrder.id);
    expect(subOrder.status).toBe('PENDING');
    expect(subOrder.stockReservedAt).toBeNull();

    const item = await prisma.orderItem.create({
      data: {
        subOrderId: subOrder.id,
        variantId: randomUUID(),
        skuSnapshot: 'SKU-1',
        titleSnapshot: 'Fone de ouvido',
        unitPriceSnapshot: '259.80',
        quantity: 1,
        weightGramsSnapshot: 250,
      },
    });
    createdItemIds.push(item.id);

    const orderWithChildren = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { subOrders: { include: { items: true } } },
    });
    expect(orderWithChildren.subOrders[0].items).toHaveLength(1);
  });

  it('marks a SubOrder READY once stock and freight timestamps are set', async () => {
    const order = await prisma.order.create({
      data: { userId: randomUUID(), addressId: randomUUID(), totalAmount: '99.90' },
    });
    createdOrderIds.push(order.id);

    const subOrder = await prisma.subOrder.create({
      data: { orderId: order.id, sellerId: randomUUID(), subtotalAmount: '99.90' },
    });
    createdSubOrderIds.push(subOrder.id);

    const updated = await prisma.subOrder.update({
      where: { id: subOrder.id },
      data: {
        stockReservedAt: new Date(),
        freightQuotedAt: new Date(),
        shippingAmount: '15.00',
        status: 'READY',
      },
    });
    expect(updated.status).toBe('READY');
    expect(updated.shippingAmount?.toString()).toBe('15');
  });

  it('rejects a duplicate ProcessedEvent eventId', async () => {
    const eventId = randomUUID();
    const processed = await prisma.processedEvent.create({
      data: { eventId, eventType: 'StockReserved' },
    });
    createdProcessedEventIds.push(processed.id);

    await expect(
      prisma.processedEvent.create({ data: { eventId, eventType: 'StockReserved' } }),
    ).rejects.toThrow();
  });
});
