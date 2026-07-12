import { Controller, Get, Inject, Param } from '@nestjs/common';
import { FREIGHT_SERVICE } from '../../../core/interfaces/services/freight-service.interface';
import type { IFreightService } from '../../../core/interfaces/services/freight-service.interface';
import type { CepResponseDto } from './dtos/cep-response.dto';

// GET /api/v1/cep/:cep — proxy de busca de endereço por CEP (autofill), público (sem JWT).
@Controller('cep')
export class CepController {
  constructor(@Inject(FREIGHT_SERVICE) private readonly freightService: IFreightService) {}

  @Get(':cep')
  async lookup(@Param('cep') cep: string): Promise<CepResponseDto> {
    return this.freightService.lookupCep(cep);
  }
}
