declare module '*shared/content-policy.mjs' {
  export function isSafeDiagram(source: string): boolean;
  export function validateDiagram(source: string): void;
  export function isSafeExternalUrl(url: string): boolean;
}
