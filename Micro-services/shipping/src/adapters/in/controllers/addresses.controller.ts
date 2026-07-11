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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADDRESS_SERVICE } from '../../../core/interfaces/services/address-service.interface';
import type {
  CallerContext,
  IAddressService,
} from '../../../core/interfaces/services/address-service.interface';
import { AddressOwnerType } from '../../../core/entities/address.entity';
import { AddressMapper } from '../../../application/mappers/address.mapper';
import type { AddressResponseDto } from './dtos/address-response.dto';
import type { CreateAddressDto } from './dtos/create-address.dto';
import type { UpdateAddressDto } from './dtos/update-address.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// CRUD de endereço (customer e seller via ownerType). JWT + ownership (ver trust-gap no address.service).
@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(@Inject(ADDRESS_SERVICE) private readonly addressService: IAddressService) {}

  @Post()
  async create(@Req() req: Request, @Body() body: CreateAddressDto): Promise<AddressResponseDto> {
    const ownerType = this.requireOwnerType(body?.ownerType);
    this.requireAddressFields(body);
    if (ownerType === 'SELLER' && !body.ownerId) {
      throw new BadRequestException('ownerId (sellerId) is required for SELLER addresses');
    }

    const address = await this.addressService.create(this.caller(req), {
      ownerType,
      ownerId: body.ownerId,
      cep: body.cep,
      street: body.street,
      number: body.number,
      complement: body.complement ?? null,
      neighborhood: body.neighborhood,
      city: body.city,
      state: body.state,
      country: body.country,
      isDefault: body.isDefault,
    });
    return AddressMapper.toResponse(address);
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('ownerType') ownerTypeRaw?: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<AddressResponseDto[]> {
    const ownerType = ownerTypeRaw ? this.requireOwnerType(ownerTypeRaw) : undefined;
    if (ownerType === 'SELLER' && !ownerId) {
      throw new BadRequestException('ownerId (sellerId) is required to list SELLER addresses');
    }
    const addresses = await this.addressService.list(this.caller(req), { ownerType, ownerId });
    return addresses.map((a) => AddressMapper.toResponse(a));
  }

  @Get(':id')
  async getById(@Req() req: Request, @Param('id') id: string): Promise<AddressResponseDto> {
    const address = await this.addressService.getById(this.caller(req), id);
    return AddressMapper.toResponse(address);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    const address = await this.addressService.update(this.caller(req), id, {
      cep: body?.cep,
      street: body?.street,
      number: body?.number,
      complement: body?.complement,
      neighborhood: body?.neighborhood,
      city: body?.city,
      state: body?.state,
      country: body?.country,
      isDefault: body?.isDefault,
    });
    return AddressMapper.toResponse(address);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string): Promise<void> {
    await this.addressService.delete(this.caller(req), id);
  }

  private caller(req: Request): CallerContext {
    return { userId: req.user!.sub, role: req.user!.role };
  }

  private requireOwnerType(value: string | undefined): AddressOwnerType {
    if (value !== 'CUSTOMER' && value !== 'SELLER') {
      throw new BadRequestException("ownerType must be 'CUSTOMER' or 'SELLER'");
    }
    return value;
  }

  private requireAddressFields(body: CreateAddressDto): void {
    const required: Array<keyof CreateAddressDto> = [
      'cep',
      'street',
      'number',
      'neighborhood',
      'city',
      'state',
    ];
    for (const field of required) {
      if (!body?.[field] || typeof body[field] !== 'string') {
        throw new BadRequestException(`${field} is required`);
      }
    }
  }
}
