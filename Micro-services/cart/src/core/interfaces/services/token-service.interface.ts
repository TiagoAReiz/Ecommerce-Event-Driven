export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Validate-only: cart-service nunca emite token, só confere a assinatura HS256
 * localmente com o `JWT_ACCESS_SECRET` compartilhado (mesmo segredo do auth-service).
 */
export interface ITokenService {
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
}
