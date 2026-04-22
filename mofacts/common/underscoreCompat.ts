export { legacyTrim, legacyInt, legacyFloat, legacyDisplay, legacyProp };

function legacyTrim(value: any): string {
  if (value == null && value !== 0 && value !== false) {
    return '';
  }

  const asString = '' + value;
  if (!asString.length) {
    return '';
  }

  if (typeof asString.trim === 'function') {
    return asString.trim();
  }
  return asString.replace(/^\s+|\s+$/gm, '');
}

function legacyInt(value: any, defaultVal = 0): number {
  let src = value;
  if (!src && src !== false && src !== 0) {
    src = '';
  } else {
    src = legacyTrim(src);
  }

  const parsed = parseInt(String(src), 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

function legacyFloat(value: any, defaultVal = 0.0): number {
  let src = value;
  if (!src && src !== false) {
    src = '';
  } else {
    src = legacyTrim(src);
  }

  const parsed = parseFloat(String(src));
  return Number.isFinite(parsed) ? parsed : defaultVal;
}

function legacyDisplay(value: any): string {
  if (!value && value !== false && value !== 0) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => legacyDisplay(item)).join(',');
  }

  return legacyTrim('' + value);
}

function legacyProp(obj: any, propname: string | number): any {
  if (Array.isArray(obj) && typeof propname === 'number') {
    return obj[propname];
  }

  if ((!obj && obj !== '') || !propname || !Object.prototype.hasOwnProperty.call(obj, propname)) {
    return null;
  }

  return obj[propname];
}
