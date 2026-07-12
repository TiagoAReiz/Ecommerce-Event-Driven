export const FREIGHT_GATEWAY = Symbol('FREIGHT_GATEWAY');

export interface FreightQuoteInput {
  originCep: string;
  destinationCep: string;
  weightGrams: number;
  // Dimensões opcionais (cotação oficial as tem; o preview avulso pode não ter).
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
}

// Uma opção de frete de uma transportadora (Correios: PAC ou SEDEX).
export interface FreightOption {
  carrier: string;
  /** Preço em reais como string fixed-2 (nunca float) — convenção MONEY do projeto. */
  price: string;
  estimatedDays: number;
}

// Port de cotação de frete dos Correios. Impl real bateria na API dos Correios; aqui é stubada com
// uma fórmula determinística por peso/dimensões (adapters/out/external).
export interface IFreightGateway {
  /** Retorna as opções de frete (PAC/SEDEX), sempre pelo menos uma, ordenadas por preço asc. */
  quote(input: FreightQuoteInput): Promise<FreightOption[]>;
}
