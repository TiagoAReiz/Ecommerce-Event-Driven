import { AddressOwnerType } from '../../../../core/entities/address.entity';

export interface AddressResponseDto {
  id: string;
  ownerType: AddressOwnerType;
  ownerId: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
