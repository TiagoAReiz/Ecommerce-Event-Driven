// Mesmo shape emitido pelo auth-service (Micro-services/auth/src/core/interfaces/services/token-service.interface.ts).
// O inventory-service NUNCA emite este token, só valida a assinatura HS256 localmente.
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}
