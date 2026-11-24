import { metroService } from '@/lib/metro-service.mjs';
import { metroResponse } from '@/lib/metro-response';

export function GET() {
  return metroResponse(() => metroService.getCatalog());
}
