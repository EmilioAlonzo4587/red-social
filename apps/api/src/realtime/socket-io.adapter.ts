import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import type { Server, ServerOptions } from 'socket.io';

// Crea el servidor de Socket.io con la configuración ya validada en src/config/env.ts.
// El decorador @WebSocketGateway({ cors }) no sirve para esto: se evalúa al importar el archivo,
// antes de que exista la configuración.
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      path: '/socket.io',
      // El cliente se instala con npm en la web; la api no sirve /socket.io/socket.io.js
      serveClient: false,
      // CORS para el transporte de polling (peticiones HTTP). En local la web (:3001) se conecta
      // directo a la api (:3000); en producción es el mismo origen y no se usa.
      cors: { origin: this.corsOrigin, credentials: true },
    }) as Server;
    // Middleware HTTP del motor de Socket.io: deja las cookies en socket.request.cookies,
    // igual que app.use(cookieParser()) hace con req.cookies en las rutas HTTP
    server.engine.use(cookieParser());
    return server;
  }
}
