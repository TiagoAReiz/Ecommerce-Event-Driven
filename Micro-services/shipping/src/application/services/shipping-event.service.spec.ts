import { ShippingEventService } from './shipping-event.service';
import { Address } from '../../core/entities/address.entity';
import { FreightQuote } from '../../core/entities/freight-quote.entity';
import { FreightQuoteNotFoundException } from '../../core/exceptions/freight-quote-not-found.exception';
import {
  OrderCreatedPayload,
  PaymentConfirmedPayload,
} from '../../core/interfaces/services/shipping-event-service.interface';

function makeAddress(overrides: Partial<Address> = {}): Address {
  return new Address({
    id: 'addr-1',
    ownerType: 'CUSTOMER',
    ownerId: 'user-1',
    cep: '01310100',
    street: 'Rua X',
    number: '10',
    complement: null,
    neighborhood: 'Centro',
    city: 'SP',
    state: 'SP',
    country: 'BR',
    isDefault: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  });
}

function buildService() {
  const addressRepository = {
    findById: jest.fn(),
    findSellerOrigin: jest.fn(),
  } as any;
  const freightQuoteRepository = {
    findBySubOrderId: jest.fn(),
    persistQuotesWithInbox: jest.fn().mockResolvedValue(true),
  } as any;
  const shipmentRepository = {
    createShipmentsWithInbox: jest.fn().mockResolvedValue(true),
  } as any;
  const freightGateway = {
    quote: jest.fn().mockResolvedValue([
      { carrier: 'PAC', price: '15.00', estimatedDays: 8 },
      { carrier: 'SEDEX', price: '28.00', estimatedDays: 3 },
    ]),
  } as any;

  const service = new ShippingEventService(
    addressRepository,
    freightQuoteRepository,
    shipmentRepository,
    freightGateway,
  );
  return { service, addressRepository, freightQuoteRepository, shipmentRepository, freightGateway };
}

const orderCreated: OrderCreatedPayload = {
  orderId: 'order-1',
  userId: 'user-1',
  addressId: 'addr-dest',
  subOrders: [
    {
      subOrderId: 'sub-1',
      sellerId: 'seller-1',
      items: [
        {
          variantId: 'v1',
          sku: 'SKU1',
          quantity: 2,
          weightGrams: 500,
          heightCm: 10,
          widthCm: 10,
          lengthCm: 10,
        },
      ],
    },
  ],
};

describe('ShippingEventService.handleOrderCreated', () => {
  it('quotes the official freight, persists FreightQuote with addressId and enqueues FreightQuoted (price fixed-2)', async () => {
    const { service, addressRepository, freightQuoteRepository, freightGateway } = buildService();
    addressRepository.findById.mockResolvedValue(makeAddress({ id: 'addr-dest', cep: '20000000' }));
    addressRepository.findSellerOrigin.mockResolvedValue(
      makeAddress({ id: 'addr-seller', ownerType: 'SELLER', ownerId: 'seller-1', cep: '01310100' }),
    );

    await service.handleOrderCreated('evt-1', orderCreated);

    // fórmula do stub recebe peso total (500*2) e caixa cúbica derivada do volume dos itens
    expect(freightGateway.quote).toHaveBeenCalledWith(
      expect.objectContaining({ originCep: '01310100', destinationCep: '20000000', weightGrams: 1000 }),
    );

    const [, eventType, input] = freightQuoteRepository.persistQuotesWithInbox.mock.calls[0];
    expect(eventType).toBe('OrderCreated');
    expect(input.quotes).toHaveLength(1);
    expect(input.quotes[0]).toMatchObject({
      subOrderId: 'sub-1',
      carrier: 'PAC', // opção mais barata (options[0])
      price: '15.00',
      addressId: 'addr-dest',
    });
    expect(input.outboxEvents).toHaveLength(1);
    expect(input.outboxEvents[0]).toMatchObject({
      eventType: 'FreightQuoted',
      aggregateId: 'sub-1',
      payload: { subOrderId: 'sub-1', orderId: 'order-1', carrier: 'PAC', price: '15.00', estimatedDays: 8 },
    });
  });

  it('enqueues FreightQuoteFailed and persists no quote when the seller has no origin address', async () => {
    const { service, addressRepository, freightQuoteRepository, freightGateway } = buildService();
    addressRepository.findById.mockResolvedValue(makeAddress({ id: 'addr-dest', cep: '20000000' }));
    addressRepository.findSellerOrigin.mockResolvedValue(null);

    await service.handleOrderCreated('evt-1', orderCreated);

    expect(freightGateway.quote).not.toHaveBeenCalled();
    const [, , input] = freightQuoteRepository.persistQuotesWithInbox.mock.calls[0];
    expect(input.quotes).toHaveLength(0);
    expect(input.outboxEvents[0]).toMatchObject({
      eventType: 'FreightQuoteFailed',
      aggregateId: 'sub-1',
      payload: { subOrderId: 'sub-1', orderId: 'order-1', reason: 'SELLER_ORIGIN_ADDRESS_NOT_FOUND' },
    });
  });

  it('enqueues FreightQuoteFailed for every subOrder when the delivery address is unknown', async () => {
    const { service, addressRepository, freightQuoteRepository } = buildService();
    addressRepository.findById.mockResolvedValue(null); // destino inexistente
    addressRepository.findSellerOrigin.mockResolvedValue(
      makeAddress({ ownerType: 'SELLER', ownerId: 'seller-1' }),
    );

    await service.handleOrderCreated('evt-1', orderCreated);

    const [, , input] = freightQuoteRepository.persistQuotesWithInbox.mock.calls[0];
    expect(input.quotes).toHaveLength(0);
    expect(input.outboxEvents[0].payload).toMatchObject({ reason: 'DELIVERY_ADDRESS_NOT_FOUND' });
  });
});

describe('ShippingEventService.handlePaymentConfirmed', () => {
  const paymentConfirmed: PaymentConfirmedPayload = {
    paymentId: 'pay-1',
    orderId: 'order-1',
    userId: 'user-1',
    method: 'PIX',
    totalAmount: 100,
    splits: [{ subOrderId: 'sub-1', sellerId: 'seller-1', amount: 90, platformFeeAmount: 10 }],
  };

  function makeQuote(): FreightQuote {
    return new FreightQuote({
      id: 'fq-1',
      subOrderId: 'sub-1',
      originCep: '01310100',
      destinationCep: '20000000',
      carrier: 'PAC',
      price: '15.00',
      estimatedDays: 8,
      addressId: 'addr-dest',
      requestedAt: new Date('2026-07-02T00:00:00.000Z'),
    });
  }

  it('creates a Shipment per split from the FreightQuote, denormalizing orderId/userId and addressId', async () => {
    const { service, freightQuoteRepository, shipmentRepository } = buildService();
    freightQuoteRepository.findBySubOrderId.mockResolvedValue(makeQuote());

    await service.handlePaymentConfirmed('evt-2', paymentConfirmed);

    const [eventId, eventType, shipments] = shipmentRepository.createShipmentsWithInbox.mock.calls[0];
    expect(eventId).toBe('evt-2');
    expect(eventType).toBe('PaymentConfirmed');
    expect(shipments).toHaveLength(1);
    expect(shipments[0]).toMatchObject({
      subOrderId: 'sub-1',
      orderId: 'order-1',
      userId: 'user-1',
      addressId: 'addr-dest',
      carrier: 'PAC',
    });
    expect(shipments[0].estimatedDeliveryDate).toBeInstanceOf(Date);
  });

  it('throws (so Kafka redelivers) and writes nothing when a FreightQuote is missing', async () => {
    const { service, freightQuoteRepository, shipmentRepository } = buildService();
    freightQuoteRepository.findBySubOrderId.mockResolvedValue(null);

    await expect(service.handlePaymentConfirmed('evt-2', paymentConfirmed)).rejects.toThrow(
      FreightQuoteNotFoundException,
    );
    expect(shipmentRepository.createShipmentsWithInbox).not.toHaveBeenCalled();
  });
});
