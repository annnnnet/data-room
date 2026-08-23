export const PDF_TYPE = 'application/pdf';

/**
 * Same PDF check for both upload entry points. The OS file picker's
 * `accept` attribute is only a hint — "All files" is one click away — so
 * the button path needs its own filter, not just the input's `accept`.
 */
export function isPdfFile(file: File): boolean {
  return file.type === PDF_TYPE || file.name.toLowerCase().endsWith('.pdf');
}

/** Shared copy for the "these weren't PDFs" toast, used by both the drop and button paths. */
export function rejectionMessage(rejectedNames: string[]): string {
  return rejectedNames.length === 1
    ? `"${rejectedNames[0]}" isn't a PDF — only PDF files can be uploaded here.`
    : `${rejectedNames.length} files were skipped — only PDF files can be uploaded here.`;
}
