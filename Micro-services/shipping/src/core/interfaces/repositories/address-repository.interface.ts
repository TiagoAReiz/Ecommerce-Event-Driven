import { Address, AddressOwnerType } from '../../entities/address.entity';

export const ADDRESS_REPOSITORY = Symbol('ADDRESS_REPOSITORY');

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

export interface IAddressRepository {
  create(data: CreateAddressData): Promise<Address>;
  findById(id: string): Promise<Address | null>;
  listByOwner(ownerType: AddressOwnerType, ownerId: string): Promise<Address[]>;
  update(id: string, data: UpdateAddressData): Promise<Address>;
  delete(id: string): Promise<void>;
  /** Primeiro endereço `ownerType=SELLER` do seller — CEP de origem pra cotação oficial. */
  findSellerOrigin(sellerId: string): Promise<Address | null>;
}
