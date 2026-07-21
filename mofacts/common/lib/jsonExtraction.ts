export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return extractJsonValue(fenced[1]);
    for (const candidate of extractBalancedJsonCandidates(trimmed)) {
      try {
        return JSON.parse(candidate);
      } catch {
        // Try the next balanced JSON object or array.
      }
    }
    throw new Error('AI response did not include a valid JSON value.');
  }
}

export function extractJsonObject(text: string): unknown {
  const value = extractJsonValue(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI response did not include a valid JSON object.');
  }
  return value;
}

function extractBalancedJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const stack: string[] = [];
  let start = -1;
  let inString = false;
  let escaping = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaping) escaping = false;
      else if (char === '\\') escaping = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') {
      if (stack.length === 0) start = index;
      stack.push(char);
      continue;
    }
    if ((char === '}' || char === ']') && stack.length > 0) {
      const opening = stack[stack.length - 1];
      if ((opening === '{' && char !== '}') || (opening === '[' && char !== ']')) {
        stack.length = 0;
        start = -1;
        continue;
      }
      stack.pop();
      if (stack.length === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}
