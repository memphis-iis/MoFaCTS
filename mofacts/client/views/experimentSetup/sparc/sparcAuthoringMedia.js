export function parseHtmlFragment(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');
  return template;
}

export function isImageHtmlNode(node) {
  if (!node || (node.atomType !== 'html-block' && node.atomType !== 'message-box')) {
    return false;
  }
  const value = String(node.value || '');
  return /<img[\s>]/i.test(value);
}

export function getFirstImageAttribute(node, attributeName) {
  if (!isImageHtmlNode(node)) {
    return '';
  }
  const template = parseHtmlFragment(node.value);
  return template.content.querySelector('img')?.getAttribute(attributeName) || '';
}

export function isHtmlMediaNode(node) {
  if (!node || (node.atomType !== 'html-block' && node.atomType !== 'message-box')) {
    return false;
  }
  const value = String(node.value || '');
  return /<(iframe|video|audio|source|embed|object)\b/i.test(value);
}

export function getHtmlMediaSummary(node) {
  if (!isHtmlMediaNode(node)) {
    return null;
  }
  const template = parseHtmlFragment(node.value);
  const element = template.content.querySelector('iframe, video, audio, source, embed, object');
  if (!element) {
    return null;
  }
  const tagName = element.tagName.toLowerCase();
  const src = element.getAttribute('src') || element.getAttribute('data') || '';
  const title = element.getAttribute('title') || '';
  const width = element.getAttribute('width') || '';
  const height = element.getAttribute('height') || '';
  return {
    tagName,
    src,
    title,
    width,
    height,
    hasLocalhostUrl: /\blocalhost\b|127\.0\.0\.1|\[::1\]/i.test(src),
  };
}

export function updateImageHtmlAttribute(node, attributeName, value) {
  if (!node || !isImageHtmlNode(node)) {
    return false;
  }
  const template = parseHtmlFragment(node.value);
  let image = template.content.querySelector('img');
  if (!image) {
    image = document.createElement('img');
    template.content.appendChild(image);
  }
  const normalized = String(value || '').trim();
  if (normalized) {
    image.setAttribute(attributeName, normalized);
  } else {
    image.removeAttribute(attributeName);
  }
  node.value = template.innerHTML;
  return true;
}

export function updateHtmlMediaAttribute(node, attributeName, value) {
  if (!node || !isHtmlMediaNode(node)) {
    return false;
  }
  const template = parseHtmlFragment(node.value);
  const element = template.content.querySelector('iframe, video, audio, source, embed, object');
  if (!element) {
    return false;
  }
  const normalized = String(value || '').trim();
  const targetAttribute = attributeName === 'src' && element.tagName.toLowerCase() === 'object'
    ? 'data'
    : attributeName;
  if (normalized) {
    element.setAttribute(targetAttribute, normalized);
  } else {
    element.removeAttribute(targetAttribute);
  }
  node.value = template.innerHTML;
  return true;
}

export function isRichTextNode(node) {
  return node && !isImageHtmlNode(node) && (node.atomType === 'html-block' || node.atomType === 'message-box');
}
