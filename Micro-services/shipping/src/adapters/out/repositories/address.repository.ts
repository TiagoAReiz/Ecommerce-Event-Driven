import { Injectable } from '@nestjs/common';
import { Address as PrismaAddress } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Address, AddressOwnerType } from '../../../core/entities/address.entity';
import { IAddressRepository } from '../../../core/interfaces/repositories/address-repository.interface';
import {
  CreateAddressData,
  UpdateAddressData,
} from '../../../core/interfaces/repositories/inputs/address-repository.inputs';

@Injectable()
export class AddressRepository implements IAddressRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAddressData): Promise<Address> {
    const row = await this.prisma.address.create({
      data: {
        id: data.id,
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        cep: data.cep,
        street: data.street,
        number: data.number,
        complement: data.complement ?? null,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        country: data.country ?? 'BR',
        isDefault: data.isDefault ?? false,
      },
    });
    return this.toEntity(row);
  }

  async findById(id: string): Promise<Address | null> {
    const row = await this.prisma.address.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async listByOwner(ownerType: AddressOwnerType, ownerId: string): Promise<Address[]> {
    const rows = await this.prisma.address.findMany({
      where: { ownerType, ownerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toEntity(row));
  }

  async update(id: string, data: UpdateAddressData): Promise<Address> {
    const row = await this.prisma.address.update({
      where: { id },
      data: {
        cep: data.cep,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        country: data.country,
        isDefault: data.isDefault,
      },
    });
    return this.toEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.address.delete({ where: { id } });
  }

  async findSellerOrigin(sellerId: string): Promise<Address | null> {
    // Endereço de origem do seller: o `isDefault` primeiro, senão o mais antigo cadastrado.
    const row = await this.prisma.address.findFirst({
      where: { ownerType: 'SELLER', ownerId: sellerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: PrismaAddress): Address {
    return new Address({
      id: row.id,
      ownerType: row.ownerType as AddressOwnerType,
      ownerId: row.ownerId,
      cep: row.cep,
      street: row.street,
      number: row.number,
      complement: row.complement,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      country: row.country,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
