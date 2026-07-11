export const TRACKING_GATEWAY = Symbol('TRACKING_GATEWAY');

// Port do rastreio dos Correios. Impl real consultaria a API de tracking; aqui é stubada de forma
// determinística — só gera o código de rastreio (a progressão de status vive no domínio, no
// ShipmentTrackingService, como uma máquina de passos determinística).
export interface ITrackingGateway {
  /** Gera um código de rastreio fake no formato dos Correios (ex.: `PACAB123456789BR`). */
  generateTrackingCode(carrier: string): string;
}
