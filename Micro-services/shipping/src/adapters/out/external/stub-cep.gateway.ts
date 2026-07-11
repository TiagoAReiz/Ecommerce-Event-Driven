import { Injectable } from '@nestjs/common';
import {
  CepAddress,
  ICepGateway,
} from '../../../core/interfaces/external/cep-gateway.interface';

// ======================= STUB DETERMINÍSTICO (NÃO É A API REAL DOS CORREIOS) =======================
// Impl real bateria em https://viacep.com.br / API dos Correios. Aqui derivamos um endereço FAKE mas
// ESTÁVEL a partir do próprio CEP (mesmo CEP -> mesmo endereço sempre), pra dev/testes sem rede.
// Regras: CEP precisa ter 8 dígitos (após remover '-'); um valor sentinela "00000000" simula
// "CEP inexistente" e retorna null.
// ===================================================================================================
const UF_BY_FIRST_DIGIT: Record<string, string> = {
  '0': 'SP',
  '1': 'SP',
  '2': 'RJ',
  '3': 'MG',
  '4': 'BA',
  '5': 'PE',
  '6': 'CE',
  '7': 'DF',
  '8': 'PR',
  '9': 'RS',
};

@Injectable()
export class StubCepGateway implements ICepGateway {
  async lookup(cep: string): Promise<CepAddress | null> {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return null;
    if (digits === '00000000') return null; // sentinela de "não encontrado"

    const uf = UF_BY_FIRST_DIGIT[digits[0]] ?? 'SP';

    return {
      cep: `${digits.slice(0, 5)}-${digits.slice(5)}`,
      street: `Rua Stub ${digits.slice(0, 3)}`,
      neighborhood: `Bairro ${digits.slice(3, 5)}`,
      city: `Cidade ${digits.slice(0, 2)}`,
      state: uf,
    };
  }
}
