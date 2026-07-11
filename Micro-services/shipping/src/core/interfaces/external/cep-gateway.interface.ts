export const CEP_GATEWAY = Symbol('CEP_GATEWAY');

// Endereço resolvido a partir de um CEP (autofill de formulário). Não inclui `number`/`complement`
// (isso o usuário preenche), só a parte que os Correios devolvem a partir do CEP.
export interface CepAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

// Port do proxy de busca de endereço por CEP dos Correios. A impl real bateria na API dos Correios;
// aqui é stubada de forma determinística (adapters/out/external).
export interface ICepGateway {
  /** Retorna o endereço do CEP, ou `null` quando o CEP não existe. */
  lookup(cep: string): Promise<CepAddress | null>;
}
