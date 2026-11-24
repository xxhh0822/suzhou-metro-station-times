import { metroService } from '@/lib/metro-service.mjs';
import { metroResponse } from '@/lib/metro-response';

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return metroResponse(() => metroService.getTimetable({
    line: params.get('line') ?? '', station: params.get('station') ?? '',
    direction: params.get('direction') ?? '', weekday: Number(params.get('weekday') ?? ''),
  }));
}
