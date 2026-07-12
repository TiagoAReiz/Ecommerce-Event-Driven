import { Inject, Injectable } from '@nestjs/common';
import { Shipment } from '../../core/entities/shipment.entity';
import { SHIPMENT_REPOSITORY } from '../../core/interfaces/repositories/shipment-repository.interface';
import type { IShipmentRepository } from '../../core/interfaces/repositories/shipment-repository.interface';
import {
  IShipmentQueryService,
} from '../../core/interfaces/services/shipment-query-service.interface';
import { CallerContext } from '../../core/interfaces/services/address-service.interface';
import { ShipmentNotFoundException } from '../../core/exceptions/shipment-not-found.exception';
import { ShipmentAccessDeniedException } from '../../core/exceptions/shipment-access-denied.exception';

@Injectable()
export class ShipmentQueryService implements IShipmentQueryService {
  constructor(
    @Inject(SHIPMENT_REPOSITORY) private readonly shipmentRepository: IShipmentRepository,
  ) {}

  async getBySubOrderId(caller: CallerContext, subOrderId: string): Promise<Shipment> {
    const shipment = await this.shipmentRepository.findBySubOrderId(subOrderId);
    if (!shipment) throw new ShipmentNotFoundException();
    // Ownership: só o dono do pedido (userId denormalizado no Shipment) vê o envio.
    if (shipment.userId !== caller.userId) throw new ShipmentAccessDeniedException();
    return shipment;
  }
}
