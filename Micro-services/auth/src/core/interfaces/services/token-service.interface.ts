export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ITokenService {
  issueTokenPair(payload: AccessTokenPayload): Promise<TokenPair>;
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
  verifyRefreshToken(token: string): Promise<{ sub: string }>;
}
