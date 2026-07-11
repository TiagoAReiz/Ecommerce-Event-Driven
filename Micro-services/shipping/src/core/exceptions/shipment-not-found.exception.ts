import { DomainException } from './domain.exception';

export class ShipmentNotFoundException extends DomainException {
  constructor() {
    super('Shipment not found');
  }
}
