import { Inject, Injectable } from '@nestjs/common';
import { CEP_GATEWAY } from '../../core/interfaces/external/cep-gateway.interface';
import type { CepAddress, ICepGateway } from '../../core/interfaces/external/cep-gateway.interface';
import { FREIGHT_GATEWAY } from '../../core/interfaces/external/freight-gateway.interface';
import type {
  FreightOption,
  IFreightGateway,
} from '../../core/interfaces/external/freight-gateway.interface';
import {
  FreightPreviewInput,
  IFreightService,
} from '../../core/interfaces/services/freight-service.interface';
import { CepNotFoundException } from '../../core/exceptions/cep-not-found.exception';
import { InvalidCepException } from '../../core/exceptions/invalid-cep.exception';

@Injectable()
export class FreightService implements IFreightService {
  constructor(
    @Inject(CEP_GATEWAY) private readonly cepGateway: ICepGateway,
    @Inject(FREIGHT_GATEWAY) private readonly freightGateway: IFreightGateway,
  ) {}

  async lookupCep(cep: string): Promise<CepAddress> {
    this.assertValidCep(cep);
    const address = await this.cepGateway.lookup(cep);
    if (!address) throw new CepNotFoundException(cep);
    return address;
  }

  async previewQuote(input: FreightPreviewInput): Promise<FreightOption[]> {
    this.assertValidCep(input.originCep);
    this.assertValidCep(input.destinationCep);
    // Preview avulso não tem dimensões (só peso) — a fórmula do stub cai no termo volumétrico 0.
    return this.freightGateway.quote({
      originCep: input.originCep,
      destinationCep: input.destinationCep,
      weightGrams: input.weightGrams,
    });
  }

  private assertValidCep(cep: string): void {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) throw new InvalidCepException(cep);
  }
}
