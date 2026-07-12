import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ORDER_SERVICE } from '../../../core/interfaces/services/order-service.interface';
import type { IOrderService } from '../../../core/interfaces/services/order-service.interface';
import { OrderMapper } from '../../../application/mappers/order.mapper';
import type { PaginatedResponseDto } from './dtos/paginated-response.dto';
import type { OrderResponseDto } from './dtos/order-response.dto';
import type { CreateOrderDto } from './dtos/create-order.dto';
import type { CancelOrderDto } from './dtos/cancel-order.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const DEFAULT_PAGE_LIMIT = 20;

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(@Inject(ORDER_SERVICE) private readonly orderService: IOrderService) {}

  @Post()
  async checkout(
    @Req() request: Request,
    @Body() body: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OrderResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (!body?.addressId) {
      throw new BadRequestException('addressId is required');
    }

    const accessToken = this.extractBearerToken(request);
    const detail = await this.orderService.checkout(
      request.user!.sub,
      body.addressId,
      idempotencyKey,
      accessToken,
    );
    return OrderMapper.toDetailResponse(detail);
  }

  @Get()
  async list(
    @Req() request: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<OrderResponseDto>> {
    const result = await this.orderService.listByUser(request.user!.sub, {
      cursor,
      limit: limit ? Number(limit) : DEFAULT_PAGE_LIMIT,
    });
    return {
      items: result.items.map((order) => OrderMapper.toSummaryResponse(order)),
      nextCursor: result.nextCursor,
    };
  }

  @Get(':id')
  async getById(@Req() request: Request, @Param('id') id: string): Promise<OrderResponseDto> {
    const detail = await this.orderService.getById(request.user!.sub, id);
    return OrderMapper.toDetailResponse(detail);
  }

  @Post(':id/cancel')
  async cancel(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
  ): Promise<OrderResponseDto> {
    const detail = await this.orderService.cancel(request.user!.sub, id, body?.cancelReason ?? '');
    return OrderMapper.toDetailResponse(detail);
  }

  private extractBearerToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing bearer token');
    }
    return header.slice('Bearer '.length);
  }
}
