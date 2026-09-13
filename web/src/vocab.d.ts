// No top-level import/export here on purpose: as soon as this file has one,
// TypeScript treats it as a module and the `declare module 'virtual:vocab'`
// below becomes an augmentation of an already-resolvable module rather than
// a fresh ambient one - which 'virtual:vocab' never is outside of Vite's own
// resolution. Keeping this a global script (using an inline `import(...)`
// type instead) is what lets the declaration apply at all.
declare module 'virtual:vocab' {
  const vocab: import('../vocab.ts').Vocab;
  export default vocab;
}
