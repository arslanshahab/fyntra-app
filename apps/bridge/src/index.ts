import 'dotenv/config';
import { NFC, type Card, type Reader } from 'nfc-pcsc';
import { WebSocketServer, WebSocket } from 'ws';

const HOST = '127.0.0.1';
const PORT = 8787;
const DEDUP_MS = 500;
const HEARTBEAT_MS = 60_000;

type DeviceDirection = 'in' | 'out' | 'both';

interface ApiConfig {
  baseUrl: string;
  token: string;
  direction: DeviceDirection;
}

interface CardTappedMessage {
  type: 'card_tapped';
  uid: string;
  readerName: string;
  timestamp: string;
}

const log = (msg: string) => console.log(`[bridge] ${msg}`);
const err = (msg: string, e?: unknown) =>
  console.error(`[bridge] ${msg}`, e ?? '');

const resolveApiConfig = (): ApiConfig | null => {
  const rawUrl = process.env.FYNTRA_API_URL?.trim();
  if (!rawUrl) {
    log('FYNTRA_API_URL not set — running in local-WS-only mode');
    return null;
  }
  const token = process.env.FYNTRA_DEVICE_TOKEN?.trim();
  if (!token) {
    err(
      'FYNTRA_API_URL set but FYNTRA_DEVICE_TOKEN missing — running in local-WS-only mode',
    );
    return null;
  }
  const rawDirection = process.env.FYNTRA_DEVICE_DIRECTION?.trim().toLowerCase();
  let direction: DeviceDirection = 'both';
  if (rawDirection === 'in' || rawDirection === 'out' || rawDirection === 'both') {
    direction = rawDirection;
  } else if (rawDirection && rawDirection.length > 0) {
    err(
      `FYNTRA_DEVICE_DIRECTION="${rawDirection}" invalid — falling back to "both"`,
    );
  }
  const baseUrl = rawUrl.replace(/\/+$/, '');
  log(
    `dual-emit enabled → POST ${baseUrl}/readers/tap (direction=${direction})`,
  );
  return { baseUrl, token, direction };
};

const apiConfig: ApiConfig | null = resolveApiConfig();

const postHeartbeatToApi = async (): Promise<void> => {
  if (!apiConfig) return;
  try {
    const res = await fetch(`${apiConfig.baseUrl}/readers/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        deviceToken: apiConfig.token,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      err(`POST /readers/heartbeat → ${res.status} ${body}`);
    }
  } catch (e) {
    err('heartbeat post failed:', e);
  }
};

if (apiConfig) {
  // Delay the first beat by 3s so the api has time to come up when both
  // services start concurrently (otherwise the first POST gets a connection
  // refused). Then beat every 60s — server marks devices offline after 180s.
  setTimeout(() => void postHeartbeatToApi(), 3_000).unref();
  setInterval(() => void postHeartbeatToApi(), HEARTBEAT_MS).unref();
}

const postTapToApi = async (uid: string, now: number): Promise<void> => {
  if (!apiConfig) return;
  const direction = apiConfig.direction === 'both' ? 'in' : apiConfig.direction;
  const res = await fetch(`${apiConfig.baseUrl}/readers/tap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      rfidUid: uid,
      direction,
      occurredAt: new Date(now).toISOString(),
      deviceToken: apiConfig.token,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    err(`POST /readers/tap → ${res.status} ${body}`);
    return;
  }
  log(`api accepted tap uid=${uid}`);
};

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
    postTapToApi(uid, now).catch((e) => err('api post failed:', e));
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
