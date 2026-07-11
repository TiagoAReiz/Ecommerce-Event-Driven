export interface FreightQuoteProps {
  id: string;
  subOrderId: string;
  originCep: string;
  destinationCep: string;
  carrier: string;
  /** Decimal serializado como string fixed-2 (nunca float) — convenção MONEY do projeto. */
  price: string;
  estimatedDays: number;
  addressId: string;
  requestedAt: Date;
}

export class FreightQuote {
  readonly id: string;
  readonly subOrderId: string;
  readonly originCep: string;
  readonly destinationCep: string;
  readonly carrier: string;
  readonly price: string;
  readonly estimatedDays: number;
  readonly addressId: string;
  readonly requestedAt: Date;

  constructor(props: FreightQuoteProps) {
    this.id = props.id;
    this.subOrderId = props.subOrderId;
    this.originCep = props.originCep;
    this.destinationCep = props.destinationCep;
    this.carrier = props.carrier;
    this.price = props.price;
    this.estimatedDays = props.estimatedDays;
    this.addressId = props.addressId;
    this.requestedAt = props.requestedAt;
  }
}
