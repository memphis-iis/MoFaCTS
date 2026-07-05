const loadedStylesheets = new Set<string>();

export function ensureStylesheet(href: string): void {
  if (loadedStylesheets.has(href) || document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
    loadedStylesheets.add(href);
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  loadedStylesheets.add(href);
}
