import { AccessTokenPayload } from '../../entities/access-token-payload.entity';

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface ITokenService {
  /** Validate-only: verifies the HS256 signature with the shared secret. Never mints tokens. */
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
}
