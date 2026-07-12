import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PAYMENT_QUERY_SERVICE } from '../../../core/interfaces/services/payment-query-service.interface';
import type { IPaymentQueryService } from '../../../core/interfaces/services/payment-query-service.interface';
import { PAYMENT_WEBHOOK_SERVICE } from '../../../core/interfaces/services/payment-webhook-service.interface';
import type {
  IPaymentWebhookService,
  MercadoPagoWebhookBody,
  WebhookHandlingResult,
} from '../../../core/interfaces/services/payment-webhook-service.interface';
import { PaymentMapper } from '../../../application/mappers/payment.mapper';
import type { PaymentResponseDto } from '../dtos/payment-response.dto';
import type { ListSellerSplitsResponseDto } from '../dtos/seller-split-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('payments')
export class PaymentsController {
  constructor(
    @Inject(PAYMENT_QUERY_SERVICE) private readonly queryService: IPaymentQueryService,
    @Inject(PAYMENT_WEBHOOK_SERVICE) private readonly webhookService: IPaymentWebhookService,
  ) {}

  // Rota estática ANTES da paramétrica `:orderId` pra `splits` não ser capturado como orderId.
  @UseGuards(JwtAuthGuard)
  @Get('splits')
  async getSplits(@Req() req: Request): Promise<ListSellerSplitsResponseDto> {
    const splits = await this.queryService.getSplitsForUser(req.user!.sub);
    return PaymentMapper.toSplitsListResponse(splits);
  }

  // Webhook do MP: NÃO usa JWT — autenticado pela assinatura MP (stubada), validada no service sobre
  // o corpo cru (rawBody habilitado no bootstrap).
  @Post('webhook/mercadopago')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: MercadoPagoWebhookBody,
  ): Promise<WebhookHandlingResult> {
    if (!body?.id || !body?.orderId || !body?.data?.id || !body?.status) {
      throw new BadRequestException('Malformed Mercado Pago webhook body');
    }
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(body);
    return this.webhookService.handleWebhook(rawBody, signature, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':orderId')
  async getByOrderId(
    @Req() req: Request,
    @Param('orderId') orderId: string,
  ): Promise<PaymentResponseDto> {
    const result = await this.queryService.getByOrderId(req.user!.sub, orderId);
    return PaymentMapper.toPaymentResponse(result);
  }
}
