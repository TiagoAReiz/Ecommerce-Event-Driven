import { AddressOwnerType } from '../../../../core/entities/address.entity';

export interface CreateAddressDto {
  ownerType: AddressOwnerType;
  // Obrigatório apenas quando ownerType=SELLER (o sellerId dono do endereço de origem).
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
