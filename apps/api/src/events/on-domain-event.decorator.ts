import { OnEvent } from '@nestjs/event-emitter';
import type { DomainEventMap, DomainEventName } from './domain-events';

// @OnEvent tipado. En un provider: @OnDomainEvent('like.changed') onLike(event: LikeChangedEvent).
// Si el método espera otros datos, no compila.
// Si el listener lanza un error, @nestjs/event-emitter lo registra en el log y no llega a quien
// emitió (suppressErrors, activo por defecto): un listener que falla no tumba la petición.
export function OnDomainEvent<K extends DomainEventName>(name: K) {
  return <T extends (payload: DomainEventMap[K]) => unknown>(
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): void => {
    OnEvent(name)(target, key, descriptor);
  };
}
