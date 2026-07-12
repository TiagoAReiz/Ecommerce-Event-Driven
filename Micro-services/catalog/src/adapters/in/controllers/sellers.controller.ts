import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SELLER_SERVICE } from '../../../core/interfaces/services/seller-service.interface';
import type { ISellerService } from '../../../core/interfaces/services/seller-service.interface';
import { PRODUCT_SERVICE } from '../../../core/interfaces/services/product-service.interface';
import type { IProductService } from '../../../core/interfaces/services/product-service.interface';
import { SellerMapper } from '../../../application/mappers/seller.mapper';
import { ProductMapper } from '../../../application/mappers/product.mapper';
import type { SellerPublicResponseDto } from '../dtos/seller-public-response.dto';
import type { SellerMeResponseDto } from '../dtos/seller-me-response.dto';
import type { OnboardSellerDto } from '../dtos/onboard-seller.dto';
import type { UpdateSellerDto } from '../dtos/update-seller.dto';
import type { PaginatedResponseDto } from '../dtos/paginated-response.dto';
import type { ProductResponseDto } from '../dtos/product-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('sellers')
export class SellersController {
  constructor(
    @Inject(SELLER_SERVICE) private readonly sellerService: ISellerService,
    @Inject(PRODUCT_SERVICE) private readonly productService: IProductService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async onboard(@Req() req: Request, @Body() body: OnboardSellerDto): Promise<SellerMeResponseDto> {
    if (!body?.storeName || !body?.document || !body?.mpCollectorId) {
      throw new BadRequestException('storeName, document and mpCollectorId are required');
    }
    const seller = await this.sellerService.onboard(req.user!.sub, {
      storeName: body.storeName,
      document: body.document,
      mpCollectorId: body.mpCollectorId,
    });
    return SellerMapper.toMeResponse(seller);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: Request): Promise<SellerMeResponseDto> {
    const seller = await this.sellerService.getMe(req.user!.sub);
    return SellerMapper.toMeResponse(seller);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@Req() req: Request, @Body() body: UpdateSellerDto): Promise<SellerMeResponseDto> {
    const seller = await this.sellerService.updateMe(req.user!.sub, {
      storeName: body?.storeName,
      mpCollectorId: body?.mpCollectorId,
    });
    return SellerMapper.toMeResponse(seller);
  }

  @Get(':id')
  async getPublic(@Param('id') id: string): Promise<SellerPublicResponseDto> {
    const seller = await this.sellerService.getPublic(id);
    return SellerMapper.toPublicResponse(seller);
  }

  @Get(':id/products')
  async listProducts(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<ProductResponseDto>> {
    const result = await this.productService.list({
      sellerId: id,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      items: result.items.map((p) => ProductMapper.toResponse(p)),
      nextCursor: result.nextCursor,
    };
  }
}
