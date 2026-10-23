/** Remove credentials before browser or durable logging; callers bound retained fields. */
export function redactSparcDialogueDiagnosticText(text: string): string {
  return text
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?):\/\/\S+/gi, '[redacted connection string]')
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[redacted URL]')
    .replace(/\b(password|token|api[_-]?key|secret)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[redacted API key]')
    .replace(/\bsk-(?:or-v1-)?[0-9A-Za-z_-]{16,}\b/g, '[redacted API key]')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted OpenRouter key]');
}
