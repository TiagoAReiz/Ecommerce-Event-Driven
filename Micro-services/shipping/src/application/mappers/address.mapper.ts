import { Address } from '../../core/entities/address.entity';
import { AddressResponseDto } from '../../adapters/in/controllers/dtos/address-response.dto';

export class AddressMapper {
  static toResponse(address: Address): AddressResponseDto {
    return {
      id: address.id,
      ownerType: address.ownerType,
      ownerId: address.ownerId,
      cep: address.cep,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      country: address.country,
      isDefault: address.isDefault,
      createdAt: address.createdAt.toISOString(),
      updatedAt: address.updatedAt.toISOString(),
    };
  }
}
