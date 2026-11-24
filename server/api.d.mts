import type { metroService } from '../lib/metro-service.mjs';

export function createApiHandler(service?: typeof metroService): (request: Request) => Promise<Response>;
export const handleApi: ReturnType<typeof createApiHandler>;
