export type StationSelection = { line: string; station: string };
export type TimetableSelection = StationSelection & { direction: string; weekday: number };
export type Catalog = { fetchedAt: string; source: string; lines: { id: string; name: string; stations: string[] }[] };
export type LiveData = StationSelection & { fetchedAt: string; serviceDate: string; directions: { name: string; services: { label: string; minutes: number | null; text: string }[] }[] };
export type Timetable = TimetableSelection & { fetchedAt: string; sourceLine: string; directions: { id: string; name: string }[]; times: string[] };
export class MetroError extends Error { status: number; constructor(message: string, status?: number); }
export function createMetroService(options?: { fetcher?: typeof fetch; now?: () => number }): {
  getCatalog(): Promise<Catalog>;
  getLive(selection: StationSelection): Promise<LiveData>;
  getTimetable(selection: TimetableSelection): Promise<Timetable>;
};
export const metroService: ReturnType<typeof createMetroService>;
