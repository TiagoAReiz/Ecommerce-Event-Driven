import { ShipmentTrackingService } from './shipment-tracking.service';
import { Shipment, ShipmentStatus } from '../../core/entities/shipment.entity';

function makeShipment(status: ShipmentStatus, overrides: Partial<Shipment> = {}): Shipment {
  return new Shipment({
    id: 'ship-1',
    subOrderId: 'sub-1',
    orderId: 'order-1',
    userId: 'user-1',
    addressId: 'addr-1',
    carrier: 'PAC',
    trackingCode: null,
    status,
    estimatedDeliveryDate: new Date('2026-07-20T00:00:00.000Z'),
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    ...overrides,
  });
}

function buildService() {
  const shipmentRepository = {
    findActiveForTracking: jest.fn(),
    advanceWithOutbox: jest.fn().mockResolvedValue(undefined),
  } as any;
  const trackingGateway = { generateTrackingCode: jest.fn().mockReturnValue('PC123456789BR') } as any;
  const service = new ShipmentTrackingService(shipmentRepository, trackingGateway);
  return { service, shipmentRepository, trackingGateway };
}

describe('ShipmentTrackingService.nextStep (state machine)', () => {
  it('LABEL_PENDING -> LABEL_CREATED assigns a tracking code and emits no event', () => {
    const { service, trackingGateway } = buildService();
    const step = service.nextStep(makeShipment('LABEL_PENDING'));
    expect(step?.update.status).toBe('LABEL_CREATED');
    expect(step?.update.trackingCode).toBe('PC123456789BR');
    expect(trackingGateway.generateTrackingCode).toHaveBeenCalledWith('PAC');
    expect(step?.outboxEvent).toBeNull();
  });

  it('LABEL_CREATED -> POSTED emits ShipmentDispatched with the tracking code and estimatedDeliveryDate', () => {
    const { service } = buildService();
    const step = service.nextStep(makeShipment('LABEL_CREATED', { trackingCode: 'PC999BR' }));
    expect(step?.update.status).toBe('POSTED');
    expect(step?.outboxEvent).toMatchObject({
      eventType: 'ShipmentDispatched',
      aggregateId: 'sub-1',
      payload: {
        subOrderId: 'sub-1',
        orderId: 'order-1',
        userId: 'user-1',
        trackingCode: 'PC999BR',
        carrier: 'PAC',
        estimatedDeliveryDate: '2026-07-20T00:00:00.000Z',
      },
    });
  });

  it('POSTED -> IN_TRANSIT emits no event', () => {
    const { service } = buildService();
    const step = service.nextStep(makeShipment('POSTED'));
    expect(step?.update.status).toBe('IN_TRANSIT');
    expect(step?.outboxEvent).toBeNull();
  });

  it('IN_TRANSIT -> DELIVERED emits ShipmentDelivered with deliveredAt', () => {
    const { service } = buildService();
    const step = service.nextStep(makeShipment('IN_TRANSIT'));
    expect(step?.update.status).toBe('DELIVERED');
    expect(step?.outboxEvent).toMatchObject({
      eventType: 'ShipmentDelivered',
      payload: { subOrderId: 'sub-1', orderId: 'order-1', userId: 'user-1' },
    });
    expect((step?.outboxEvent?.payload as any).deliveredAt).toEqual(expect.any(String));
  });

  it('returns null for terminal statuses (DELIVERED / RETURNED)', () => {
    const { service } = buildService();
    expect(service.nextStep(makeShipment('DELIVERED'))).toBeNull();
    expect(service.nextStep(makeShipment('RETURNED'))).toBeNull();
  });
});

describe('ShipmentTrackingService.advanceShipments (job)', () => {
  it('advances every active shipment one step via advanceWithOutbox', async () => {
    const { service, shipmentRepository } = buildService();
    shipmentRepository.findActiveForTracking.mockResolvedValue([
      makeShipment('LABEL_PENDING'),
      makeShipment('IN_TRANSIT', { id: 'ship-2', subOrderId: 'sub-2' }),
    ]);

    await service.advanceShipments();

    expect(shipmentRepository.advanceWithOutbox).toHaveBeenCalledTimes(2);
    expect(shipmentRepository.advanceWithOutbox).toHaveBeenCalledWith(
      'ship-1',
      expect.objectContaining({ status: 'LABEL_CREATED' }),
      null,
    );
    expect(shipmentRepository.advanceWithOutbox).toHaveBeenCalledWith(
      'ship-2',
      expect.objectContaining({ status: 'DELIVERED' }),
      expect.objectContaining({ eventType: 'ShipmentDelivered' }),
    );
  });

  it('does not start a second pass while one is in flight', async () => {
    const { service, shipmentRepository } = buildService();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    shipmentRepository.findActiveForTracking.mockReturnValueOnce(gate.then(() => []));

    const first = service.advanceShipments();
    const second = service.advanceShipments();
    release();
    await Promise.all([first, second]);

    expect(shipmentRepository.findActiveForTracking).toHaveBeenCalledTimes(1);
  });
});
