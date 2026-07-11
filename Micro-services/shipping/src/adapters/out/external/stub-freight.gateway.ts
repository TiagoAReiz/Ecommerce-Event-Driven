import { Injectable } from '@nestjs/common';
import {
  FreightOption,
  FreightQuoteInput,
  IFreightGateway,
} from '../../../core/interfaces/external/freight-gateway.interface';

// ===================== STUB DETERMINÍSTICO (NÃO É A API REAL DOS CORREIOS) =========================
// Impl real chamaria o cálculo de frete dos Correios (PAC/SEDEX) via CEP origem/destino + peso +
// dimensões. Aqui usamos uma FÓRMULA FAKE determinística: mesmo input -> mesmo preço/prazo sempre.
//   preço = base_transportadora + peso_kg * taxa_peso + volume_cm3 * taxa_volume + distância_cep
//   prazo = base_dias + fator_distância
// SEDEX é mais caro e mais rápido que PAC. Preço retornado como string fixed-2 (convenção MONEY).
// ===================================================================================================
interface CarrierParams {
  carrier: string;
  baseReais: number;
  perKgReais: number;
  baseDays: number;
}

const CARRIERS: CarrierParams[] = [
  { carrier: 'PAC', baseReais: 15, perKgReais: 8, baseDays: 8 },
  { carrier: 'SEDEX', baseReais: 28, perKgReais: 12, baseDays: 3 },
];

// Fator de volume (dimensional weight): cm3 -> "kg cúbico" pelo divisor 6000 (padrão logístico).
const VOLUMETRIC_DIVISOR = 6000;
const PER_VOLUMETRIC_KG_REAIS = 6;

@Injectable()
export class StubFreightGateway implements IFreightGateway {
  async quote(input: FreightQuoteInput): Promise<FreightOption[]> {
    const weightKg = Math.max(input.weightGrams, 1) / 1000;

    const volumetricKg =
      input.heightCm && input.widthCm && input.lengthCm
        ? (input.heightCm * input.widthCm * input.lengthCm) / VOLUMETRIC_DIVISOR
        : 0;

    // "Distância" determinística: diferença absoluta entre os prefixos de 5 dígitos dos CEPs,
    // normalizada — só pra o preço/prazo variarem com origem/destino de forma estável.
    const distanceFactor = this.distanceFactor(input.originCep, input.destinationCep);

    const options = CARRIERS.map((c) => {
      const priceReais =
        c.baseReais +
        weightKg * c.perKgReais +
        volumetricKg * PER_VOLUMETRIC_KG_REAIS +
        distanceFactor * 10;
      const estimatedDays = c.baseDays + Math.round(distanceFactor * 5);
      return {
        carrier: c.carrier,
        price: priceReais.toFixed(2),
        estimatedDays,
      } satisfies FreightOption;
    });

    // Ordena por preço ascendente (PAC primeiro no caso base) — a cotação oficial escolhe o [0].
    return options.sort((a, b) => Number(a.price) - Number(b.price));
  }

  private distanceFactor(originCep: string, destinationCep: string): number {
    const a = Number(originCep.replace(/\D/g, '').slice(0, 5)) || 0;
    const b = Number(destinationCep.replace(/\D/g, '').slice(0, 5)) || 0;
    return Math.abs(a - b) / 100000; // 0..~1
  }
}
