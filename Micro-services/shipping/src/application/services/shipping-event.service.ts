import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ADDRESS_REPOSITORY } from '../../core/interfaces/repositories/address-repository.interface';
import type { IAddressRepository } from '../../core/interfaces/repositories/address-repository.interface';
import { FREIGHT_QUOTE_REPOSITORY } from '../../core/interfaces/repositories/freight-quote-repository.interface';
import type {
  CreateFreightQuoteData,
  CreateOutboxEventInput,
  IFreightQuoteRepository,
} from '../../core/interfaces/repositories/freight-quote-repository.interface';
import { SHIPMENT_REPOSITORY } from '../../core/interfaces/repositories/shipment-repository.interface';
import type {
  CreateShipmentData,
  IShipmentRepository,
} from '../../core/interfaces/repositories/shipment-repository.interface';
import { FREIGHT_GATEWAY } from '../../core/interfaces/external/freight-gateway.interface';
import type { IFreightGateway } from '../../core/interfaces/external/freight-gateway.interface';
import {
  IShippingEventService,
  OrderCreatedPayload,
  OrderCreatedSubOrder,
  PaymentConfirmedPayload,
} from '../../core/interfaces/services/shipping-event-service.interface';
import { FreightQuoteNotFoundException } from '../../core/exceptions/freight-quote-not-found.exception';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class ShippingEventService implements IShippingEventService {
  private readonly logger = new Logger(ShippingEventService.name);

  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addressRepository: IAddressRepository,
    @Inject(FREIGHT_QUOTE_REPOSITORY)
    private readonly freightQuoteRepository: IFreightQuoteRepository,
    @Inject(SHIPMENT_REPOSITORY) private readonly shipmentRepository: IShipmentRepository,
    @Inject(FREIGHT_GATEWAY) private readonly freightGateway: IFreightGateway,
  ) {}

  // ============================ OrderCreated -> cotação OFICIAL por SubOrder =========================
  // Para cada SubOrder: acha o CEP de origem (endereço SELLER do sellerId) e o CEP de destino (o
  // endereço de entrega do cliente, payload.addressId), cota o frete no stub dos Correios, persiste
  // a FreightQuote (com addressId, pra o Shipment saber o destino depois) e enfileira FreightQuoted.
  // Se faltar origem ou destino, enfileira FreightQuoteFailed e NÃO persiste FreightQuote.
  // Tudo numa transação com inbox (dedupe por eventId).
  async handleOrderCreated(eventId: string, payload: OrderCreatedPayload): Promise<void> {
    const destination = await this.addressRepository.findById(payload.addressId);
    const destinationCep = destination?.cep ?? null;

    const quotes: CreateFreightQuoteData[] = [];
    const outboxEvents: CreateOutboxEventInput[] = [];

    for (const subOrder of payload.subOrders) {
      const origin = await this.addressRepository.findSellerOrigin(subOrder.sellerId);

      if (!origin) {
        outboxEvents.push(
          this.failedEvent(subOrder.subOrderId, payload.orderId, 'SELLER_ORIGIN_ADDRESS_NOT_FOUND'),
        );
        continue;
      }
      if (!destinationCep) {
        outboxEvents.push(
          this.failedEvent(subOrder.subOrderId, payload.orderId, 'DELIVERY_ADDRESS_NOT_FOUND'),
        );
        continue;
      }

      const options = await this.freightGateway.quote({
        originCep: origin.cep,
        destinationCep,
        ...this.packageDimensions(subOrder),
      });
      // Cotação oficial escolhe a opção mais barata (gateway retorna ordenado por preço asc).
      const chosen = options[0];

      quotes.push({
        id: randomUUID(),
        subOrderId: subOrder.subOrderId,
        originCep: origin.cep,
        destinationCep,
        carrier: chosen.carrier,
        price: chosen.price,
        estimatedDays: chosen.estimatedDays,
        addressId: payload.addressId,
      });
      outboxEvents.push({
        aggregateType: 'FreightQuote',
        aggregateId: subOrder.subOrderId,
        eventType: 'FreightQuoted',
        payload: {
          subOrderId: subOrder.subOrderId,
          orderId: payload.orderId,
          carrier: chosen.carrier,
          price: chosen.price, // string fixed-2
          estimatedDays: chosen.estimatedDays,
        },
      });
    }

    await this.freightQuoteRepository.persistQuotesWithInbox(eventId, 'OrderCreated', {
      quotes,
      outboxEvents,
    });
  }

  // ========================= PaymentConfirmed -> cria o Shipment por SubOrder ========================
  // Para cada split, usa a FreightQuote (addressId + carrier + prazo) pra criar o Shipment. orderId e
  // userId vêm do top-level do PaymentConfirmed e são denormalizados no Shipment (pro job de rastreio
  // montar os eventos depois). Se faltar a FreightQuote de algum split, lança (Kafka reentrega) — nada
  // é gravado. shipping deliberadamente NÃO consome PaymentFailed.
  async handlePaymentConfirmed(eventId: string, payload: PaymentConfirmedPayload): Promise<void> {
    const now = Date.now();
    const shipments: CreateShipmentData[] = [];

    for (const split of payload.splits) {
      const quote = await this.freightQuoteRepository.findBySubOrderId(split.subOrderId);
      if (!quote) {
        throw new FreightQuoteNotFoundException(split.subOrderId);
      }

      shipments.push({
        id: randomUUID(),
        subOrderId: split.subOrderId,
        orderId: payload.orderId,
        userId: payload.userId,
        addressId: quote.addressId,
        carrier: quote.carrier,
        estimatedDeliveryDate: new Date(now + quote.estimatedDays * MS_PER_DAY),
      });
    }

    await this.shipmentRepository.createShipmentsWithInbox(eventId, 'PaymentConfirmed', shipments);
  }

  private failedEvent(subOrderId: string, orderId: string, reason: string): CreateOutboxEventInput {
    return {
      aggregateType: 'FreightQuote',
      aggregateId: subOrderId,
      eventType: 'FreightQuoteFailed',
      payload: { subOrderId, orderId, reason },
    };
  }

  // Peso total = soma(peso_item * qtd). "Caixa" aproximada = cubo cujo volume é a soma dos volumes
  // dos itens (h*w*l*qtd) -> lado = raiz cúbica. Determinístico; alimenta o termo volumétrico do stub.
  private packageDimensions(subOrder: OrderCreatedSubOrder): {
    weightGrams: number;
    heightCm: number;
    widthCm: number;
    lengthCm: number;
  } {
    let weightGrams = 0;
    let volume = 0;
    for (const item of subOrder.items) {
      weightGrams += item.weightGrams * item.quantity;
      volume += item.heightCm * item.widthCm * item.lengthCm * item.quantity;
    }
    const side = volume > 0 ? Math.cbrt(volume) : 0;
    return { weightGrams, heightCm: side, widthCm: side, lengthCm: side };
  }
}
