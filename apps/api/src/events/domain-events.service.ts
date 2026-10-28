import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventMap, DomainEventName } from './domain-events';

// Emisor tipado: el nombre del evento decide qué datos acepta. Los servicios inyectan esta
// clase y no EventEmitter2, así un evento con otro nombre o con datos incompletos no compila.
@Injectable()
export class DomainEvents {
  constructor(private readonly emitter: EventEmitter2) {}

  emit<K extends DomainEventName>(name: K, payload: DomainEventMap[K]): void {
    this.emitter.emit(name, payload);
  }
}
