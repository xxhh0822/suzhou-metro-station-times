export type MetroLine = { id: string; name: string; stations: string[] };
export type MetroService = { label: '最近班次' | '下一班'; minutes: number | null; text: string };
export type MetroDirection = { id: string; name: string };
export type MetroSelection = { line: string; station: string };
export function parseCatalog(html: string): MetroLine[];
export function parseLive(html: string, expected: MetroSelection): { name: string; services: MetroService[] }[];
export function parseTimetable(html: string, expected: MetroSelection & { direction: string; weekday: number }): { sourceLine: string; directions: MetroDirection[]; times: string[] };
