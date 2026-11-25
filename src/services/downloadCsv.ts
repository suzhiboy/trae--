/** 下载 UTF-8 CSV；内容由 teacher.ts 生成，已带 BOM。 */
export function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function safeFilenamePart(value: string): string {
  const cleaned = value.trim().replace(/[\s/\\:*?"<>|]+/g, '-').replace(/-+/g, '-');
  return cleaned.slice(0, 40) || 'report';
}
