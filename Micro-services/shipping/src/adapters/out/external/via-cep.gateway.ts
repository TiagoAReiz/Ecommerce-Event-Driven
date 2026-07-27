import { Injectable } from '@nestjs/common';
import { CepAddress, ICepGateway } from '../../../core/interfaces/external/cep-gateway.interface';
import { CepServiceUnavailableException } from '../../../core/exceptions/cep-service-unavailable.exception';

interface ViaCepResponse {
  erro?: boolean;
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

@Injectable()
export class ViaCepGateway implements ICepGateway {
  private readonly baseUrl = process.env.VIA_CEP_URL ?? 'https://viacep.com.br/ws';

  async lookup(cep: string): Promise<CepAddress | null> {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return null;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${digits}/json/`);
    } catch {
      throw new CepServiceUnavailableException();
    }

    if (!response.ok) {
      throw new CepServiceUnavailableException();
    }

    const body = (await response.json()) as ViaCepResponse;
    if (body.erro) return null;

    return {
      cep: body.cep,
      street: body.logradouro,
      neighborhood: body.bairro,
      city: body.localidade,
      state: body.uf,
    };
  }
}
