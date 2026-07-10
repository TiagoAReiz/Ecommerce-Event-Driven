import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { InvalidRefreshTokenException } from '../../../core/exceptions/invalid-refresh-token.exception';
import { GoogleAuthenticationFailedException } from '../../../core/exceptions/google-authentication-failed.exception';
import { EmailAlreadyInUseException } from '../../../core/exceptions/email-already-in-use.exception';
import { UserNotFoundException } from '../../../core/exceptions/user-not-found.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (exception instanceof InvalidRefreshTokenException) {
      return new UnauthorizedException(exception.message);
    }
    if (exception instanceof GoogleAuthenticationFailedException) {
      return new BadRequestException(exception.message);
    }
    if (exception instanceof EmailAlreadyInUseException) {
      return new ConflictException(exception.message);
    }
    if (exception instanceof UserNotFoundException) {
      return new NotFoundException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
