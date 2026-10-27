/** Portable package-path policy shared by validation and retrieval. No Node dependencies. */
export function normalizedRelativePath(value, label = 'Package path') {
  if (typeof value !== 'string' || value.length > 200 || !/^[A-Za-z0-9_./-]+$/u.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..' || /[. ]$/u.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    throw new Error(`${label}: path must be normalized and relative`);
  }
  return value;
}
