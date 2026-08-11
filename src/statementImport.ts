import type { Movement } from './mockData';
import { parseCurrencyInput } from './financeEngine';

export type StatementPreviewItem = {
  id: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  occurredAt: string;
  isDuplicate: boolean;
};

function normalizeKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDate(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

export function previewStatementCsv(csv: string, existing: Movement[]): StatementPreviewItem[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(separator).map(normalizeKey);
  const dateIndex = headers.findIndex((header) => ['data', 'date', 'datamovimento'].includes(header));
  const titleIndex = headers.findIndex((header) => ['descricao', 'description', 'historico', 'lancamento'].includes(header));
  const valueIndex = headers.findIndex((header) => ['valor', 'value', 'amount'].includes(header));
  if (dateIndex < 0 || titleIndex < 0 || valueIndex < 0) return [];

  return lines.slice(1).flatMap((line, index) => {
    const columns = line.split(separator).map((column) => column.trim().replace(/^"|"$/g, ''));
    const occurredAt = parseDate(columns[dateIndex] ?? '');
    const rawAmount = parseCurrencyInput(columns[valueIndex] ?? '');
    const title = columns[titleIndex] ?? '';
    if (!occurredAt || !title || !Number.isFinite(rawAmount) || rawAmount === 0) return [];
    const amount = Math.abs(rawAmount);
    const type: StatementPreviewItem['type'] = rawAmount >= 0 ? 'income' : 'expense';
    const isDuplicate = existing.some((movement) => movement.type === type && movement.amount === amount && movement.createdAt.slice(0, 10) === occurredAt && normalizeKey(movement.title) === normalizeKey(title));
    return [{ id: `csv-${index}`, title, amount, type, occurredAt, isDuplicate }];
  });
}
