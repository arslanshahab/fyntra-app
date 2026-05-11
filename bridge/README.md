# Fyntra Bridge

Local-only Node service that connects to an **ACR122U USB NFC reader** over PC/SC and broadcasts every card tap to a WebSocket on `ws://127.0.0.1:8787`. The Fyntra frontend's `useReaderBridge()` hook consumes it.

Phase 1 is read-only: tap → emit → forget. No DB, no auth, no HTTP, not reachable on the LAN.

## Run

```sh
npm install
npm run dev
```

Production-ish:

```sh
npm run build && npm run start
```

## Protocol

Each tap is broadcast to every connected WebSocket client as a single JSON line:

```json
{
  "type": "card_tapped",
  "uid": "AABBCCDD",
  "readerName": "ACS ACR122U PICC Interface 00 00",
  "timestamp": "2026-05-11T07:42:00.000Z"
}
```

- `uid` — uppercase hex, no separators.
- `timestamp` — ISO-8601 UTC at the moment of the tap.
- Duplicate `(uid, readerName)` pairs within **500 ms** are suppressed (the ACR122U sometimes double-fires).
- The server binds to `127.0.0.1` only; LAN clients cannot connect.

## OS setup

The reader speaks PC/SC. The host OS smart-card daemon does the heavy lifting; `nfc-pcsc` is just a Node binding on top of it.

### macOS

Modern macOS ships **CryptoTokenKit / IOSCardCCID**, which often claims the ACR122U before `nfc-pcsc` can. If `npm run dev` shows no `reader attached` line even though the device shows up in **System Information → USB**, you have two options:

**Option A — install upstream libccid (recommended):**

```sh
brew install libccid
```

Then unplug and replug the reader.

**Option B — unload Apple's CCID kext:**

```sh
sudo kextunload /System/Library/Extensions/IOSCardCCID.kext
```

On Apple Silicon you may need to **partially disable SIP** (Reduced Security in Recovery) before macOS will let you unload the kext. The kext returns on the next boot, so this is per-session.

### Linux (Debian / Ubuntu)

```sh
sudo apt install pcscd libpcsclite-dev
sudo systemctl enable --now pcscd
```

Verify the daemon sees the reader: `pcsc_scan` (from `pcsc-tools`) should print `ACS ACR122U`.

### Windows

`WinSCard` is built into Windows; `nfc-pcsc` should work out of the box. If `npm install` fails to compile the native binding, install **Visual Studio Build Tools** with the C++ workload — `node-gyp` needs them.

## Testing without a reader

There's no clean local stub. The Fyntra frontend ships a **"Simulate Tap"** panel at `/admin/devices` that lets you enter a UID by hand — use that when no reader is plugged in.

## Logging

Plain `console.log`, one event per line, prefixed `[bridge]`. Errors go to stderr. Example session:

```
[bridge] listening on ws://127.0.0.1:8787
[bridge] reader attached: ACS ACR122U PICC Interface 00 00
[bridge] client connected (1 total)
[bridge] card_tapped uid=AABBCCDD reader="ACS ACR122U PICC Interface 00 00"
[bridge] client disconnected (0 total)
[bridge] reader detached: ACS ACR122U PICC Interface 00 00
```
