export interface FreightOptionDto {
  carrier: string;
  /** string fixed-2 (nunca float) — convenção MONEY do projeto. */
  price: string;
  estimatedDays: number;
}

export interface FreightQuoteResponseDto {
  originCep: string;
  destinationCep: string;
  weightGrams: number;
  options: FreightOptionDto[];
}
