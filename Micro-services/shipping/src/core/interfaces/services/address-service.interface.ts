import { Address, AddressOwnerType } from '../../entities/address.entity';

export const ADDRESS_SERVICE = Symbol('ADDRESS_SERVICE');

// Contexto do caller extraído do JWT (validate-only). `role` faz o gate grosso de endereço SELLER.
export interface CallerContext {
  userId: string;
  role: string;
}

export interface CreateAddressInput {
  ownerType: AddressOwnerType;
  // Só usado quando ownerType=SELLER: o sellerId (ownerId do endereço de origem). Ver trust-gap
  // documentado no address.service.ts.
  ownerId?: string;
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

export interface UpdateAddressInput {
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

export interface ListAddressesFilter {
  ownerType?: AddressOwnerType;
  // Só usado quando ownerType=SELLER: o sellerId cujos endereços listar.
  ownerId?: string;
}

export interface IAddressService {
  create(caller: CallerContext, input: CreateAddressInput): Promise<Address>;
  list(caller: CallerContext, filter: ListAddressesFilter): Promise<Address[]>;
  getById(caller: CallerContext, id: string): Promise<Address>;
  update(caller: CallerContext, id: string, input: UpdateAddressInput): Promise<Address>;
  delete(caller: CallerContext, id: string): Promise<void>;
}
