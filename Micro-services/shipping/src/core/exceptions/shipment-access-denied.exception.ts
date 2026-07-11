import { DomainException } from './domain.exception';

export class ShipmentAccessDeniedException extends DomainException {
  constructor() {
    super('You do not own this shipment');
  }
}
