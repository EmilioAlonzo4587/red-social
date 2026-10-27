import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

// Marca una ruta que no exige sesión. Todas las demás pasan por SessionGuard (guard global),
// así una ruta nueva sin decorador queda cerrada y no abierta por olvido.
export const Public = () => SetMetadata(IS_PUBLIC, true);
