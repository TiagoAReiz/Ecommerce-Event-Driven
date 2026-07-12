import { Shipment } from '../../entities/shipment.entity';
import { CallerContext } from './address-service.interface';

export const SHIPMENT_QUERY_SERVICE = Symbol('SHIPMENT_QUERY_SERVICE');

export interface IShipmentQueryService {
  /** Status/tracking do envio de um SubOrder. Ownership: `Shipment.userId == caller.userId`. */
  getBySubOrderId(caller: CallerContext, subOrderId: string): Promise<Shipment>;
}
