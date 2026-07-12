import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { FREIGHT_SERVICE } from '../../../core/interfaces/services/freight-service.interface';
import type { IFreightService } from '../../../core/interfaces/services/freight-service.interface';
import type { FreightQuoteResponseDto } from './dtos/freight-quote-response.dto';

// GET /api/v1/freight/quote?originCep&destinationCep&weightGrams — cotação avulsa de preview
// (carrinho), público (sem JWT). NÃO persiste FreightQuote — a cotação oficial é reativa a OrderCreated.
@Controller('freight')
export class FreightController {
  constructor(@Inject(FREIGHT_SERVICE) private readonly freightService: IFreightService) {}

  @Get('quote')
  async quote(
    @Query('originCep') originCep: string,
    @Query('destinationCep') destinationCep: string,
    @Query('weightGrams') weightGrams: string,
  ): Promise<FreightQuoteResponseDto> {
    if (!originCep || !destinationCep) {
      throw new BadRequestException('originCep and destinationCep are required');
    }
    const weight = Number(weightGrams);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new BadRequestException('weightGrams must be a positive number');
    }

    const options = await this.freightService.previewQuote({
      originCep,
      destinationCep,
      weightGrams: weight,
    });

    return { originCep, destinationCep, weightGrams: weight, options };
  }
}
