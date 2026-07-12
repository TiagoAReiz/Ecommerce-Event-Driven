import { AccessTokenPayload } from '../../core/interfaces/services/token-service.interface';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
