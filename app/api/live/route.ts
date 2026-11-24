import { metroService } from '@/lib/metro-service.mjs';
import { metroResponse } from '@/lib/metro-response';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return metroResponse(() => metroService.getLive({ line: params.get('line') ?? '', station: params.get('station') ?? '' }));
}
