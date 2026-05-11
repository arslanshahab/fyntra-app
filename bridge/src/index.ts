import { NFC, type Card, type Reader } from 'nfc-pcsc';
import { WebSocketServer, WebSocket } from 'ws';

const HOST = '127.0.0.1';
const PORT = 8787;
const DEDUP_MS = 500;

interface CardTappedMessage {
  type: 'card_tapped';
  uid: string;
  readerName: string;
  timestamp: string;
}

const log = (msg: string) => console.log(`[bridge] ${msg}`);
const err = (msg: string, e?: unknown) =>
  console.error(`[bridge] ${msg}`, e ?? '');

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on('listening', () => log(`listening on ws://${HOST}:${PORT}`));
wss.on('error', (e) => err('websocket server error:', e));

wss.on('connection', (ws) => {
  log(`client connected (${wss.clients.size} total)`);
  ws.on('close', () => log(`client disconnected (${wss.clients.size} total)`));
  ws.on('error', (e) => err('client socket error:', e));
});

const broadcast = (message: CardTappedMessage) => {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
};

const lastSeen = new Map<string, number>();
const shouldEmit = (key: string, now: number): boolean => {
  const prev = lastSeen.get(key);
  if (prev !== undefined && now - prev < DEDUP_MS) return false;
  lastSeen.set(key, now);
  return true;
};

const extractUid = (card: Card): string | null => {
  const raw = card.uid;
  if (typeof raw === 'string' && raw.length > 0) return raw.toUpperCase();
  if (raw instanceof Uint8Array) return Buffer.from(raw).toString('hex').toUpperCase();
  if (card.atr instanceof Uint8Array) return Buffer.from(card.atr).toString('hex').toUpperCase();
  return null;
};

const nfc = new NFC();

nfc.on('reader', (reader: Reader) => {
  const readerName = reader.reader.name;
  log(`reader attached: ${readerName}`);

  reader.on('card', (card: Card) => {
    const uid = extractUid(card);
    if (!uid) {
      err(`card event with no UID on reader "${readerName}"`);
      return;
    }
    const key = `${readerName}::${uid}`;
    const now = Date.now();
    if (!shouldEmit(key, now)) return;

    const message: CardTappedMessage = {
      type: 'card_tapped',
      uid,
      readerName,
      timestamp: new Date(now).toISOString(),
    };
    log(`card_tapped uid=${uid} reader="${readerName}"`);
    broadcast(message);
  });

  reader.on('error', (e: unknown) => err(`reader "${readerName}" error:`, e));
  reader.on('end', () => log(`reader detached: ${readerName}`));
});

nfc.on('error', (e: unknown) => err('nfc error:', e));

const shutdown = (signal: string) => {
  log(`received ${signal}, shutting down`);
  for (const client of wss.clients) client.close();
  wss.close(() => {
    try {
      nfc.close();
    } catch (e) {
      err('error closing nfc:', e);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
