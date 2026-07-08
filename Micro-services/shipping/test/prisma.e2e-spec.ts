import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/adapters/out/database/prisma.service';

describe('shipping-db schema', () => {
  let prisma: PrismaService;
  const createdAddressIds: string[] = [];
  const createdShipmentIds: string[] = [];
  const createdFreightQuoteIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdOutboxIds } } });
    await prisma.shipment.deleteMany({ where: { id: { in: createdShipmentIds } } });
    await prisma.freightQuote.deleteMany({ where: { id: { in: createdFreightQuoteIds } } });
    await prisma.address.deleteMany({ where: { id: { in: createdAddressIds } } });
    await prisma.onModuleDestroy();
  });

  it('quotes freight and creates a Shipment for the same SubOrder', async () => {
    const address = await prisma.address.create({
      data: {
        ownerType: 'CUSTOMER',
        ownerId: randomUUID(),
        cep: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    createdAddressIds.push(address.id);
    expect(address.country).toBe('BR');

    const subOrderId = randomUUID();
    const quote = await prisma.freightQuote.create({
      data: {
        subOrderId,
        originCep: '04001-000',
        destinationCep: address.cep,
        carrier: 'PAC',
        price: '22.50',
        estimatedDays: 6,
      },
    });
    createdFreightQuoteIds.push(quote.id);

    const shipment = await prisma.shipment.create({
      data: { subOrderId, addressId: address.id, carrier: quote.carrier },
    });
    createdShipmentIds.push(shipment.id);
    expect(shipment.status).toBe('LABEL_PENDING');
  });

  it('rejects a second FreightQuote for the same SubOrder', async () => {
    const subOrderId = randomUUID();
    const quote = await prisma.freightQuote.create({
      data: {
        subOrderId,
        originCep: '04001-000',
        destinationCep: '20040-020',
        carrier: 'SEDEX',
        price: '35.00',
        estimatedDays: 2,
      },
    });
    createdFreightQuoteIds.push(quote.id);

    await expect(
      prisma.freightQuote.create({
        data: {
          subOrderId,
          originCep: '04001-000',
          destinationCep: '20040-020',
          carrier: 'SEDEX',
          price: '40.00',
          estimatedDays: 2,
        },
      }),
    ).rejects.toThrow();
  });

  it('creates an OutboxEvent with default status PENDING', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Shipment',
        aggregateId: randomUUID(),
        eventType: 'ShipmentDispatched',
        payload: { trackingCode: 'BR123456789' },
      },
    });
    createdOutboxIds.push(event.id);
    expect(event.status).toBe('PENDING');
  });
});
