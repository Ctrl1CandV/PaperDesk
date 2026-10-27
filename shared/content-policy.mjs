/** Shared build/runtime policy. This module intentionally has no Node dependencies. */
export function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(value)) return false;
  try {
    const url = new URL(value);
    return /^https?:\/\//u.test(value) && ['http:', 'https:'].includes(url.protocol)
      && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

/** Deliberately small reviewed flowchart subset; unsupported syntax fails closed. */
export function validateDiagram(source) {
  const fail = () => { throw new Error('Diagram requires a reviewed flowchart with plain labels and simple arrows.'); };
  if (typeof source !== 'string' || source.length > 12000 || /[<{}%&`"'\\\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(source) || /\b(?:fa[bslr]?:|icon:)/iu.test(source)) fail();
  const lines = source.trim().split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!/^flowchart (?:LR|RL|TB|TD|BT)$/u.test(lines.shift() ?? '') || lines.length === 0 || lines.length > 100) fail();
  const node = '[A-Za-z][A-Za-z0-9_]{0,39}(?:\\[[^<>\\[\\]\\r\\n]{1,160}\\])?';
  const statement = new RegExp(`^${node}(?:\\s*-->\\s*${node})?$`, 'u');
  const defined = new Set();
  const referenced = new Set();
  for (const line of lines) {
    if (!statement.test(line)) fail();
    for (const match of line.matchAll(/([A-Za-z][A-Za-z0-9_]*)(\[[^\]]+\])?/gu)) {
      referenced.add(match[1]);
      if (match[2]) defined.add(match[1]);
    }
  }
  if (referenced.size > 50 || [...referenced].some((id) => !defined.has(id))) fail();
}

export function isSafeDiagram(source) {
  try { validateDiagram(source); return true; } catch { return false; }
}
