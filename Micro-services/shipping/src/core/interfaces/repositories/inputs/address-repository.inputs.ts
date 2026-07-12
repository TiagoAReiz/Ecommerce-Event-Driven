import { AddressOwnerType } from '../../../entities/address.entity';

export interface CreateAddressData {
  id: string;
  ownerType: AddressOwnerType;
  ownerId: string;
  cep: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  country?: string;
  isDefault?: boolean;
}

export interface UpdateAddressData {
  cep?: string;
  street?: string;
  number?: string;
  complement?: string | null;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  isDefault?: boolean;
}
