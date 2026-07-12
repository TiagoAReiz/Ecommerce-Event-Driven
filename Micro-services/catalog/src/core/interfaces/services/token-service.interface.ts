export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface ITokenService {
  /** Validate-only: verifies the HS256 signature with the shared secret. Never mints tokens. */
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
}
