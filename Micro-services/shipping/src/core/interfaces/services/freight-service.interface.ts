import { CepAddress } from '../external/cep-gateway.interface';
import { FreightOption } from '../external/freight-gateway.interface';

export const FREIGHT_SERVICE = Symbol('FREIGHT_SERVICE');

export interface FreightPreviewInput {
  originCep: string;
  destinationCep: string;
  weightGrams: number;
}

// Endpoints síncronos públicos de UX: busca de CEP (autofill) e cotação avulsa de preview.
// Nenhum dos dois persiste nada — a cotação OFICIAL por SubOrder é reativa a OrderCreated.
export interface IFreightService {
  lookupCep(cep: string): Promise<CepAddress>;
  previewQuote(input: FreightPreviewInput): Promise<FreightOption[]>;
}
