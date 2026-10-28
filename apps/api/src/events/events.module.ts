import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DomainEvents } from './domain-events.service';

// Global, como PrismaModule: cualquier servicio inyecta DomainEvents sin importar este módulo,
// y los módulos de contenido no se importan entre sí para avisarse cosas (D08).
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [DomainEvents],
  exports: [DomainEvents],
})
export class EventsModule {}
