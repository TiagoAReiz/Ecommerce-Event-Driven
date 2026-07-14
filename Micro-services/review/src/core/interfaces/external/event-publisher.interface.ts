export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface IEventPublisher {
  publish(topic: string, key: string, value: string): Promise<void>;
}
