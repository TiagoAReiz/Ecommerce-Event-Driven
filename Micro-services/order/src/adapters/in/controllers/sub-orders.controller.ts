import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ORDER_SERVICE } from '../../../core/interfaces/services/order-service.interface';
import type { IOrderService } from '../../../core/interfaces/services/order-service.interface';
import { SubOrderMapper } from '../../../application/mappers/sub-order.mapper';
import type { SubOrderStatus } from '../../../core/entities/sub-order.entity';
import type { PaginatedResponseDto } from './dtos/paginated-response.dto';
import type { SubOrderResponseDto } from './dtos/sub-order-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const DEFAULT_PAGE_LIMIT = 20;

// Dashboard do seller: ownership é `SubOrder.sellerId === Seller.id do usuário logado`,
// resolvido via catalog `GET /sellers/me` (order não tem tabela Seller própria).
@Controller('sub-orders')
@UseGuards(JwtAuthGuard)
export class SubOrdersController {
  constructor(@Inject(ORDER_SERVICE) private readonly orderService: IOrderService) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<SubOrderResponseDto>> {
    const accessToken = this.extractBearerToken(request);
    const result = await this.orderService.listBySeller(accessToken, {
      status: status as SubOrderStatus | undefined,
      cursor,
      limit: limit ? Number(limit) : DEFAULT_PAGE_LIMIT,
    });
    return {
      items: result.items.map((subOrder) => SubOrderMapper.toResponse(subOrder)),
      nextCursor: result.nextCursor,
    };
  }

  @Get(':id')
  async getById(@Req() request: Request, @Param('id') id: string): Promise<SubOrderResponseDto> {
    const accessToken = this.extractBearerToken(request);
    const found = await this.orderService.getSubOrderById(accessToken, id);
    return SubOrderMapper.toResponse(found.subOrder, found.items);
  }

  private extractBearerToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing bearer token');
    }
    return header.slice('Bearer '.length);
  }
}
