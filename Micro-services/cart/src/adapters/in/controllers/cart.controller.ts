import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CART_SERVICE } from '../../../core/interfaces/services/cart-service.interface';
import type { ICartService } from '../../../core/interfaces/services/cart-service.interface';
import { CartMapper } from '../../../application/mappers/cart.mapper';
import type { CartResponseDto } from '../dtos/cart-response.dto';
import type { AddCartItemDto } from '../dtos/add-cart-item.dto';
import type { UpdateCartItemDto } from '../dtos/update-cart-item.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(@Inject(CART_SERVICE) private readonly cartService: ICartService) {}

  @Get()
  async getCart(@Req() request: Request): Promise<CartResponseDto> {
    const cart = await this.cartService.getOrCreateCart(request.user!.sub);
    return CartMapper.toResponse(cart);
  }

  @Post('items')
  async addItem(@Req() request: Request, @Body() body: AddCartItemDto): Promise<CartResponseDto> {
    if (!body?.variantId || typeof body.variantId !== 'string') {
      throw new BadRequestException('variantId is required');
    }
    if (body.quantity === undefined || body.quantity === null || typeof body.quantity !== 'number') {
      throw new BadRequestException('quantity is required');
    }

    const accessToken = this.extractBearerToken(request);
    const cart = await this.cartService.addItem(
      request.user!.sub,
      body.variantId,
      body.quantity,
      accessToken,
    );
    return CartMapper.toResponse(cart);
  }

  @Patch('items/:id')
  async updateItem(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    if (body?.quantity === undefined || body.quantity === null || typeof body.quantity !== 'number') {
      throw new BadRequestException('quantity is required');
    }

    const cart = await this.cartService.updateItemQuantity(request.user!.sub, id, body.quantity);
    return CartMapper.toResponse(cart);
  }

  @Delete('items/:id')
  async removeItem(@Req() request: Request, @Param('id') id: string): Promise<CartResponseDto> {
    const cart = await this.cartService.removeItem(request.user!.sub, id);
    return CartMapper.toResponse(cart);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearCart(@Req() request: Request): Promise<void> {
    await this.cartService.clearCart(request.user!.sub);
  }

  private extractBearerToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing bearer token');
    }
    return header.slice('Bearer '.length);
  }
}
