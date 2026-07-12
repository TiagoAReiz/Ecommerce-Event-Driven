import { Body, Controller, Get, Inject, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PRODUCT_SERVICE } from '../../../core/interfaces/services/product-service.interface';
import type { IProductService } from '../../../core/interfaces/services/product-service.interface';
import { ProductVariantMapper } from '../../../application/mappers/product-variant.mapper';
import { VariantDetailMapper } from '../../../application/mappers/variant-detail.mapper';
import type { ProductVariantResponseDto } from '../dtos/product-variant-response.dto';
import type { VariantDetailResponseDto } from '../dtos/variant-detail-response.dto';
import type { UpdateVariantDto } from '../dtos/update-variant.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('variants')
export class VariantsController {
  constructor(@Inject(PRODUCT_SERVICE) private readonly productService: IProductService) {}

  @Get(':id')
  async getById(@Param('id') id: string): Promise<VariantDetailResponseDto> {
    const detail = await this.productService.getVariantDetail(id);
    return VariantDetailMapper.toResponse(detail);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateVariantDto,
  ): Promise<ProductVariantResponseDto> {
    const variant = await this.productService.updateVariant(req.user!.sub, id, {
      sku: body?.sku,
      attributes: body?.attributes,
      price: body?.price,
      weightGrams: body?.weightGrams,
      heightCm: body?.heightCm,
      widthCm: body?.widthCm,
      lengthCm: body?.lengthCm,
    });
    return ProductVariantMapper.toResponse(variant);
  }
}
