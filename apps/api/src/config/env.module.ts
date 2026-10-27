import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from './env';

// Global: cualquier servicio puede inyectar la configuración con @Inject(ENV).
// loadEnv() corre al crear la app, así que una variable faltante detiene el arranque.
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class EnvModule {}
