import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Address, AddressOwnerType } from '../../core/entities/address.entity';
import { ADDRESS_REPOSITORY } from '../../core/interfaces/repositories/address-repository.interface';
import type { IAddressRepository } from '../../core/interfaces/repositories/address-repository.interface';
import {
  CallerContext,
  CreateAddressInput,
  IAddressService,
  ListAddressesFilter,
  UpdateAddressInput,
} from '../../core/interfaces/services/address-service.interface';
import { AddressNotFoundException } from '../../core/exceptions/address-not-found.exception';
import { AddressAccessDeniedException } from '../../core/exceptions/address-access-denied.exception';
import { SellerAddressForbiddenException } from '../../core/exceptions/seller-address-forbidden.exception';

// ==================================== OWNERSHIP / TRUST-GAP ========================================
// Decisão de escopo (desvio documentado, endossado no design — abordagem "X"):
//   - Endereços CUSTOMER: ownerId = userId do JWT. Ownership é verificável 100% (ownerId == sub).
//   - Endereços SELLER:   ownerId = sellerId FORNECIDO pelo cliente. O shipping-service NÃO tem como
//     amarrar sellerId ao userId do JWT sem um read-model de `SellerOnboarded` (catalog-events) —
//     e o escopo deste serviço só consome order-events/payment-events. Consequência: qualquer caller
//     com role SELLER pode, em teoria, mexer no endereço de origem de outro seller. TRUST GAP aceito
//     e registrado; fechá-lo exigiria consumir catalog-events (mesmo padrão do SellerPaymentProfile
//     no payment-db). O gate `role === 'SELLER'` é o único controle aqui.
// A cotação OFICIAL (OrderCreated) acha o endereço de origem por sellerId (findSellerOrigin), então
// endereços SELLER PRECISAM ser encontráveis por sellerId — daí ownerId = sellerId.
// ===================================================================================================
@Injectable()
export class AddressService implements IAddressService {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addressRepository: IAddressRepository,
  ) {}

  async create(caller: CallerContext, input: CreateAddressInput): Promise<Address> {
    const ownerId = this.resolveOwnerForWrite(caller, input.ownerType, input.ownerId);
    return this.addressRepository.create({
      id: randomUUID(),
      ownerType: input.ownerType,
      ownerId,
      cep: input.cep,
      street: input.street,
      number: input.number,
      complement: input.complement ?? null,
      neighborhood: input.neighborhood,
      city: input.city,
      state: input.state,
      country: input.country,
      isDefault: input.isDefault,
    });
  }

  async list(caller: CallerContext, filter: ListAddressesFilter): Promise<Address[]> {
    const ownerType: AddressOwnerType = filter.ownerType ?? 'CUSTOMER';
    const ownerId = this.resolveOwnerForRead(caller, ownerType, filter.ownerId);
    return this.addressRepository.listByOwner(ownerType, ownerId);
  }

  async getById(caller: CallerContext, id: string): Promise<Address> {
    const address = await this.getOrThrow(id);
    this.assertOwnership(caller, address);
    return address;
  }

  async update(caller: CallerContext, id: string, input: UpdateAddressInput): Promise<Address> {
    const address = await this.getOrThrow(id);
    this.assertOwnership(caller, address);
    return this.addressRepository.update(id, {
      cep: input.cep,
      street: input.street,
      number: input.number,
      complement: input.complement,
      neighborhood: input.neighborhood,
      city: input.city,
      state: input.state,
      country: input.country,
      isDefault: input.isDefault,
    });
  }

  async delete(caller: CallerContext, id: string): Promise<void> {
    const address = await this.getOrThrow(id);
    this.assertOwnership(caller, address);
    await this.addressRepository.delete(id);
  }

  private async getOrThrow(id: string): Promise<Address> {
    const address = await this.addressRepository.findById(id);
    if (!address) throw new AddressNotFoundException();
    return address;
  }

  // Na ESCRITA, o ownerId de SELLER vem do cliente (trust gap acima); o de CUSTOMER é forçado do JWT.
  private resolveOwnerForWrite(
    caller: CallerContext,
    ownerType: AddressOwnerType,
    suppliedOwnerId: string | undefined,
  ): string {
    if (ownerType === 'CUSTOMER') return caller.userId;
    // SELLER
    if (caller.role !== 'SELLER') throw new SellerAddressForbiddenException();
    return suppliedOwnerId as string; // presença garantida pelo controller (BadRequest se ausente)
  }

  // Na LEITURA (list), mesma resolução — CUSTOMER filtra pelo próprio userId, SELLER pelo sellerId.
  private resolveOwnerForRead(
    caller: CallerContext,
    ownerType: AddressOwnerType,
    suppliedOwnerId: string | undefined,
  ): string {
    if (ownerType === 'CUSTOMER') return caller.userId;
    if (caller.role !== 'SELLER') throw new SellerAddressForbiddenException();
    return suppliedOwnerId as string;
  }

  private assertOwnership(caller: CallerContext, address: Address): void {
    if (address.ownerType === 'CUSTOMER') {
      if (address.ownerId !== caller.userId) throw new AddressAccessDeniedException();
      return;
    }
    // SELLER: só role SELLER passa (trust gap: não conseguimos amarrar sellerId->userId aqui).
    if (caller.role !== 'SELLER') throw new AddressAccessDeniedException();
  }
}
