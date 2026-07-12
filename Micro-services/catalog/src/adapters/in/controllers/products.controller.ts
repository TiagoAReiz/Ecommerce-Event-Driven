import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PRODUCT_SERVICE } from '../../../core/interfaces/services/product-service.interface';
import type { IProductService } from '../../../core/interfaces/services/product-service.interface';
import { ProductMapper } from '../../../application/mappers/product.mapper';
import { ProductVariantMapper } from '../../../application/mappers/product-variant.mapper';
import type { PaginatedResponseDto } from '../dtos/paginated-response.dto';
import type { ProductResponseDto } from '../dtos/product-response.dto';
import type { ProductDetailResponseDto } from '../dtos/product-detail-response.dto';
import type { ProductVariantResponseDto } from '../dtos/product-variant-response.dto';
import type { CreateProductDto } from '../dtos/create-product.dto';
import type { UpdateProductDto } from '../dtos/update-product.dto';
import type { CreateVariantDto } from '../dtos/create-variant.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('products')
export class ProductsController {
  constructor(@Inject(PRODUCT_SERVICE) private readonly productService: IProductService) {}

  @Get()
  async list(
    @Query('categoryId') categoryId?: string,
    @Query('sellerId') sellerId?: string,
    @Query('query') query?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<ProductResponseDto>> {
    const result = await this.productService.list({
      categoryId,
      sellerId,
      query,
      minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
      maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      items: result.items.map((p) => ProductMapper.toResponse(p)),
      nextCursor: result.nextCursor,
    };
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<ProductDetailResponseDto> {
    const { product, variants } = await this.productService.getById(id);
    return ProductMapper.toDetailResponse(product, variants);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: Request, @Body() body: CreateProductDto): Promise<ProductResponseDto> {
    if (!body?.categoryId || !body?.title || !body?.description) {
      throw new BadRequestException('categoryId, title and description are required');
    }
    const product = await this.productService.create(req.user!.sub, {
      categoryId: body.categoryId,
      title: body.title,
      description: body.description,
    });
    return ProductMapper.toResponse(product);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const product = await this.productService.update(req.user!.sub, id, {
      categoryId: body?.categoryId,
      title: body?.title,
      description: body?.description,
      status: body?.status,
    });
    return ProductMapper.toResponse(product);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: Request, @Param('id') id: string): Promise<void> {
    await this.productService.softDelete(req.user!.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/variants')
  async createVariant(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateVariantDto,
  ): Promise<ProductVariantResponseDto> {
    if (
      !body?.sku ||
      body?.price === undefined ||
      body?.weightGrams === undefined ||
      body?.heightCm === undefined ||
      body?.widthCm === undefined ||
      body?.lengthCm === undefined
    ) {
      throw new BadRequestException('sku, price, weightGrams, heightCm, widthCm and lengthCm are required');
    }
    const variant = await this.productService.createVariant(req.user!.sub, id, {
      sku: body.sku,
      attributes: body.attributes ?? {},
      price: body.price,
      weightGrams: body.weightGrams,
      heightCm: body.heightCm,
      widthCm: body.widthCm,
      lengthCm: body.lengthCm,
    });
    return ProductVariantMapper.toResponse(variant);
  }
}
