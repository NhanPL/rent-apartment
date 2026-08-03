export const UTF8_BOM = '\uFEFF';

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;
const UNSAFE_FILENAME_CHARACTER = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

export const sanitizeCsvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return CSV_FORMULA_PREFIX.test(text) ? `'${text}` : text;
};

export const escapeCsvCell = (value: unknown): string => (
  `"${sanitizeCsvCell(value).replace(/"/g, '""')}"`
);

export const createCsv = (headers: unknown[], rows: unknown[][]): string => {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(','))
  ];
  return `${UTF8_BOM}${lines.join('\r\n')}`;
};

export const sanitizeCsvFilename = (value: string, fallback = 'export.csv'): string => {
  const basename = value.split(/[\\/]/).at(-1) ?? '';
  const sanitized = basename
    .replace(UNSAFE_FILENAME_CHARACTER, '_')
    .replace(/^\.+/, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
    .replace(/[. ]+$/, '');
  const safeBase = sanitized || fallback.replace(UNSAFE_FILENAME_CHARACTER, '_') || 'export.csv';
  return safeBase.toLowerCase().endsWith('.csv') ? safeBase : `${safeBase}.csv`;
};

const encodeRfc5987Value = (value: string): string => (
  encodeURIComponent(value).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
);

export const buildCsvContentDisposition = (filename: string): string => {
  const safeFilename = sanitizeCsvFilename(filename);
  const asciiFallback = safeFilename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\;]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987Value(safeFilename)}`;
};
