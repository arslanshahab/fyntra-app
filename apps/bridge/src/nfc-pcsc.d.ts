declare module 'nfc-pcsc' {
  import { EventEmitter } from 'node:events';

  export interface Card {
    uid?: string | Buffer;
    atr?: Buffer;
    type?: string;
    standard?: string;
  }

  export interface Reader extends EventEmitter {
    reader: { name: string };
    name: string;
    close(): void;
  }

  export class NFC extends EventEmitter {
    constructor(logger?: unknown);
    close(): void;
  }

  export default NFC;
}
