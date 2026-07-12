import { ShipmentQueryService } from './shipment-query.service';
import { Shipment } from '../../core/entities/shipment.entity';
import { ShipmentNotFoundException } from '../../core/exceptions/shipment-not-found.exception';
import { ShipmentAccessDeniedException } from '../../core/exceptions/shipment-access-denied.exception';

function makeShipment(userId: string): Shipment {
  return new Shipment({
    id: 'ship-1',
    subOrderId: 'sub-1',
    orderId: 'order-1',
    userId,
    addressId: 'addr-1',
    carrier: 'PAC',
    trackingCode: 'PC1BR',
    status: 'POSTED',
    estimatedDeliveryDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function buildService() {
  const shipmentRepository = { findBySubOrderId: jest.fn() } as any;
  const service = new ShipmentQueryService(shipmentRepository);
  return { service, shipmentRepository };
}

describe('ShipmentQueryService.getBySubOrderId', () => {
  it('returns the shipment to its owner', async () => {
    const { service, shipmentRepository } = buildService();
    shipmentRepository.findBySubOrderId.mockResolvedValue(makeShipment('user-1'));
    await expect(
      service.getBySubOrderId({ userId: 'user-1', role: 'CUSTOMER' }, 'sub-1'),
    ).resolves.toMatchObject({ subOrderId: 'sub-1' });
  });

  it('throws ShipmentNotFound when there is no shipment for the subOrder', async () => {
    const { service, shipmentRepository } = buildService();
    shipmentRepository.findBySubOrderId.mockResolvedValue(null);
    await expect(
      service.getBySubOrderId({ userId: 'user-1', role: 'CUSTOMER' }, 'sub-1'),
    ).rejects.toThrow(ShipmentNotFoundException);
  });

  it('denies access when the shipment belongs to another user', async () => {
    const { service, shipmentRepository } = buildService();
    shipmentRepository.findBySubOrderId.mockResolvedValue(makeShipment('other-user'));
    await expect(
      service.getBySubOrderId({ userId: 'user-1', role: 'CUSTOMER' }, 'sub-1'),
    ).rejects.toThrow(ShipmentAccessDeniedException);
  });
});
