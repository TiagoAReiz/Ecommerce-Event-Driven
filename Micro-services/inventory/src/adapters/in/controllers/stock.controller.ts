import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { STOCK_SERVICE } from '../../../core/interfaces/services/stock-service.interface';
import type { IStockService } from '../../../core/interfaces/services/stock-service.interface';
import { StockMapper } from '../../../application/mappers/stock.mapper';
import type { StockAvailabilityResponseDto } from '../dtos/stock-availability-response.dto';
import type { StockItemResponseDto } from '../dtos/stock-item-response.dto';
import type { InitStockDto } from '../dtos/init-stock.dto';
import type { UpdateStockDto } from '../dtos/update-stock.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('stock')
export class StockController {
  constructor(@Inject(STOCK_SERVICE) private readonly stockService: IStockService) {}

  @Get(':variantId')
  async getAvailability(
    @Param('variantId') variantId: string,
  ): Promise<StockAvailabilityResponseDto> {
    const stock = await this.stockService.getByVariantId(variantId);
    return StockMapper.toAvailabilityResponse(stock);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async initStock(
    @Req() request: Request,
    @Body() body: InitStockDto,
  ): Promise<StockItemResponseDto> {
    if (!body?.variantId || typeof body.variantId !== 'string') {
      throw new BadRequestException('variantId is required');
    }
    if (body.quantity === undefined || body.quantity === null || typeof body.quantity !== 'number') {
      throw new BadRequestException('quantity is required');
    }

    const accessToken = this.extractBearerToken(request);
    const stock = await this.stockService.initStock(accessToken, {
      variantId: body.variantId,
      quantity: body.quantity,
    });
    return StockMapper.toItemResponse(stock);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':variantId')
  async updateStock(
    @Req() request: Request,
    @Param('variantId') variantId: string,
    @Body() body: UpdateStockDto,
  ): Promise<StockItemResponseDto> {
    if (body?.quantity === undefined || body.quantity === null || typeof body.quantity !== 'number') {
      throw new BadRequestException('quantity is required');
    }

    const accessToken = this.extractBearerToken(request);
    const stock = await this.stockService.updateStock(accessToken, variantId, {
      quantity: body.quantity,
    });
    return StockMapper.toItemResponse(stock);
  }

  // O JWT do usuário é repassado às chamadas síncronas ao catalog (resolução de ownership).
  private extractBearerToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing bearer token');
    }
    return header.slice('Bearer '.length);
  }
}
