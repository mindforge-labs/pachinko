import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

/** Turn plain ALL-CAPS section labels into markdown headings for preview. */
export function toPreviewMarkdown(source: string) {
  return source.replace(/^(?!#)([A-Z][A-Z0-9 /&+.,():-]{2,})$/gm, '## $1');
}

export function renderMarkdown(source: string) {
  const html = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function renderPreviewMarkdown(source: string) {
  return renderMarkdown(toPreviewMarkdown(source));
}
