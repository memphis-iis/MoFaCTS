export function parseCssTimeToMs(value: string | null | undefined): number {
  if (!value) return 0;
  if (value.endsWith('ms')) {
    const parsed = Number(value.slice(0, -2));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value.endsWith('s')) {
    const parsed = Number(value.slice(0, -1));
    return Number.isFinite(parsed) ? parsed * 1000 : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getElementTransitionDurationMs(
  element: Element | null | undefined,
  getComputedStyleForElement: (element: Element) => Pick<CSSStyleDeclaration, 'transitionDuration' | 'transitionDelay'>,
): number {
  if (!element) return 0;
  const style = getComputedStyleForElement(element);
  const durationValue = style.transitionDuration?.split(',')?.[0]?.trim() || '';
  const delayValue = style.transitionDelay?.split(',')?.[0]?.trim() || '';
  return parseCssTimeToMs(durationValue) + parseCssTimeToMs(delayValue);
}
