import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '../../../core/exceptions/domain.exception';
import { AddressNotFoundException } from '../../../core/exceptions/address-not-found.exception';
import { AddressAccessDeniedException } from '../../../core/exceptions/address-access-denied.exception';
import { ShipmentNotFoundException } from '../../../core/exceptions/shipment-not-found.exception';
import { ShipmentAccessDeniedException } from '../../../core/exceptions/shipment-access-denied.exception';
import { SellerAddressForbiddenException } from '../../../core/exceptions/seller-address-forbidden.exception';
import { InvalidCepException } from '../../../core/exceptions/invalid-cep.exception';
import { CepNotFoundException } from '../../../core/exceptions/cep-not-found.exception';

// Traduz exceções de domínio (core) em HttpException do NestJS, mantendo o core livre de framework.
// Exceções puramente do fluxo de consumo Kafka (ex.: FreightQuoteNotFoundException) NÃO aparecem em
// contexto HTTP — são deixadas propagar pro Kafka reentregar e nunca chegam neste filter.
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const httpException = this.toHttp(exception);
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttp(exception: DomainException): HttpException {
    if (
      exception instanceof AddressNotFoundException ||
      exception instanceof ShipmentNotFoundException ||
      exception instanceof CepNotFoundException
    ) {
      return new NotFoundException(exception.message);
    }
    if (
      exception instanceof AddressAccessDeniedException ||
      exception instanceof ShipmentAccessDeniedException ||
      exception instanceof SellerAddressForbiddenException
    ) {
      return new ForbiddenException(exception.message);
    }
    if (exception instanceof InvalidCepException) {
      return new BadRequestException(exception.message);
    }
    return new InternalServerErrorException();
  }
}
