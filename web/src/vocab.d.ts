import type { Vocab } from '../vocab.ts';

declare module 'virtual:vocab' {
  const vocab: Vocab;
  export default vocab;
}
