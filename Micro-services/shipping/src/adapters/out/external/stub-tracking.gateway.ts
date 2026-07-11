import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ITrackingGateway } from '../../../core/interfaces/external/tracking-gateway.interface';

// ===================== STUB DETERMINÍSTICO (NÃO É A API REAL DOS CORREIOS) =========================
// Impl real geraria/consultaria o código de rastreio nos Correios. Aqui geramos um código FAKE no
// formato dos Correios (2 letras + 9 dígitos + "BR"), prefixado pela transportadora, pra dev/testes.
// ===================================================================================================
@Injectable()
export class StubTrackingGateway implements ITrackingGateway {
  generateTrackingCode(carrier: string): string {
    const prefix = carrier === 'SEDEX' ? 'SX' : 'PC';
    const digits = randomUUID().replace(/\D/g, '').padEnd(9, '0').slice(0, 9);
    return `${prefix}${digits}BR`;
  }
}
