import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenPayload, ITokenService } from 'src/core/interfaces/services/token-service.interface';
@Injectable()
export class TokenService implements ITokenService {
  constructor(private readonly jwtService: JwtService) { }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync<AccessTokenPayload>(token, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
  }
}
