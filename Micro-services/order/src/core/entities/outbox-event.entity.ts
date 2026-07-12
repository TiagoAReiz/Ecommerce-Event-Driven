export interface OutboxEventProps {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

export class OutboxEvent {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly createdAt: Date;

  constructor(props: OutboxEventProps) {
    this.id = props.id;
    this.aggregateType = props.aggregateType;
    this.aggregateId = props.aggregateId;
    this.eventType = props.eventType;
    this.payload = props.payload;
    this.createdAt = props.createdAt;
  }
}
