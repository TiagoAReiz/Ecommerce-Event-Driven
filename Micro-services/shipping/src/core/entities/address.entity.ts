export type AddressOwnerType = 'CUSTOMER' | 'SELLER';

export interface AddressProps {
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
  createdAt: Date;
  updatedAt: Date;
}

export class Address {
  readonly id: string;
  readonly ownerType: AddressOwnerType;
  readonly ownerId: string;
  readonly cep: string;
  readonly street: string;
  readonly number: string;
  readonly complement: string | null;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: AddressProps) {
    this.id = props.id;
    this.ownerType = props.ownerType;
    this.ownerId = props.ownerId;
    this.cep = props.cep;
    this.street = props.street;
    this.number = props.number;
    this.complement = props.complement;
    this.neighborhood = props.neighborhood;
    this.city = props.city;
    this.state = props.state;
    this.country = props.country;
    this.isDefault = props.isDefault;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
