import { Injectable } from '@nestjs/common';
import { FreightQuote as PrismaFreightQuote, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FreightQuote } from '../../../core/entities/freight-quote.entity';
import { IFreightQuoteRepository } from '../../../core/interfaces/repositories/freight-quote-repository.interface';
import { PersistQuotesInput } from '../../../core/interfaces/repositories/inputs/freight-quote-repository.inputs';

@Injectable()
export class FreightQuoteRepository implements IFreightQuoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySubOrderId(subOrderId: string): Promise<FreightQuote | null> {
    const row = await this.prisma.freightQuote.findUnique({ where: { subOrderId } });
    return row ? this.toEntity(row) : null;
  }

  async persistQuotesWithInbox(
    eventId: string,
    eventType: string,
    input: PersistQuotesInput,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // dedupe: se já processamos esse eventId, no-op (ver ProcessedEvent inbox pattern)
      if (await tx.processedEvent.findUnique({ where: { eventId } })) return false;

      for (const q of input.quotes) {
        await tx.freightQuote.create({
          data: {
            id: q.id,
            subOrderId: q.subOrderId,
            originCep: q.originCep,
            destinationCep: q.destinationCep,
            carrier: q.carrier,
            // Prisma aceita string em coluna Decimal — preserva a precisão fixed-2.
            price: q.price,
            estimatedDays: q.estimatedDays,
            addressId: q.addressId,
          },
        });
      }

      for (const e of input.outboxEvents) {
        await tx.outboxEvent.create({
          data: {
            ...(e.id ? { id: e.id } : {}),
            aggregateType: e.aggregateType,
            aggregateId: e.aggregateId,
            eventType: e.eventType,
            payload: e.payload as Prisma.InputJsonValue,
          },
        });
      }

      await tx.processedEvent.create({ data: { eventId, eventType } });
      return true;
    });
  }

  private toEntity(row: PrismaFreightQuote): FreightQuote {
    return new FreightQuote({
      id: row.id,
      subOrderId: row.subOrderId,
      originCep: row.originCep,
      destinationCep: row.destinationCep,
      carrier: row.carrier,
      // Decimal -> string fixed-2 (não toString(), pra não perder trailing zeros: "15.00").
      price: row.price.toFixed(2),
      estimatedDays: row.estimatedDays,
      addressId: row.addressId,
      requestedAt: row.requestedAt,
    });
  }
}
