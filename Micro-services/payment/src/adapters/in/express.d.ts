import { AccessTokenPayload } from '../../core/entities/access-token-payload.entity';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
