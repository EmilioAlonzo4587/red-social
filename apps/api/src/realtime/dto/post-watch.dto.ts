import { plainToInstance, type ClassConstructor } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUUID,
  validateSync,
} from 'class-validator';

// Límite de ids por evento: una pantalla o varias páginas de feed cargadas
export const MAX_WATCH_POST_IDS = 100;

// post:watch y post:unwatch (docs/05-api.md): { postIds: string[] }
export class PostWatchDto {
  @IsUUID('all', { each: true })
  @ArrayMaxSize(MAX_WATCH_POST_IDS)
  @ArrayMinSize(1)
  @IsArray()
  postIds!: string[];
}

// Valida un payload de Socket.io con las mismas reglas que el ValidationPipe HTTP
// (whitelist + forbidNonWhitelisted). Si no cumple, devuelve null y el handler lo ignora.
export function parseWsDto<T extends object>(
  cls: ClassConstructor<T>,
  payload: unknown,
): T | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const instance = plainToInstance(cls, payload);
  const errors = validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.length === 0 ? instance : null;
}
