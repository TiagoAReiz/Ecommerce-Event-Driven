import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SHIPMENT_QUERY_SERVICE } from '../../../core/interfaces/services/shipment-query-service.interface';
import type { IShipmentQueryService } from '../../../core/interfaces/services/shipment-query-service.interface';
import { ShipmentMapper } from '../../../application/mappers/shipment.mapper';
import type { ShipmentResponseDto } from './dtos/shipment-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// GET /api/v1/shipments/:subOrderId — status/tracking do envio. JWT + ownership (Shipment.userId).
@Controller('shipments')
@UseGuards(JwtAuthGuard)
export class ShipmentsController {
  constructor(
    @Inject(SHIPMENT_QUERY_SERVICE) private readonly shipmentQueryService: IShipmentQueryService,
  ) {}

  @Get(':subOrderId')
  async getBySubOrderId(
    @Req() req: Request,
    @Param('subOrderId') subOrderId: string,
  ): Promise<ShipmentResponseDto> {
    const shipment = await this.shipmentQueryService.getBySubOrderId(
      { userId: req.user!.sub, role: req.user!.role },
      subOrderId,
    );
    return ShipmentMapper.toResponse(shipment);
  }
}
