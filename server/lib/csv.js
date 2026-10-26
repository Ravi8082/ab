const DANGEROUS_PREFIXES = /^[=+\-@\t\r]/;

/**
 * CSV cells land in Excel/Sheets, where a leading `=`, `+`, `-`, `@`, tab or carriage return is
 * evaluated as a formula. Visitor-supplied names and emails reach exports unchanged, so those
 * cells are neutralised with a leading apostrophe.
 */
export function csvCell(value) {
  const text = String(value ?? '');
  const guarded = DANGEROUS_PREFIXES.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function csvRow(cells) {
  return cells.map(csvCell).join(',');
}
