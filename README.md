# Ryftipe

Ryftipe is an experimental remotely rendered Chromium browser. Its Chromium browser runs on the server; your browser receives JPEG frames through a WebSocket and sends mouse and keyboard input back.

## Run locally
Node.js 22+ required.

```sh
npm install
npx playwright install --with-deps chromium
RYFTIPE_PASSWORD=replace-with-a-long-secret npm start
```

On Windows PowerShell, set `$env:RYFTIPE_PASSWORD="replace-with-a-long-secret"` then run `npm start`. Open http://localhost:3000.

## Deploy with Render
Create a Blueprint from `render.yaml`, then configure `RYFTIPE_PASSWORD` with a unique strong password. This project includes a Playwright Chromium Docker image. Use a paid instance with sufficient memory for Chromium. Render needs to permit WebSockets.

## Initial features (v0.1.0)
- Remote Chromium with screenshot streaming.
- URL navigation, back/forward, reload, mouse click and scroll, keyboard and viewport resize.
- Password-protected login and isolated ephemeral browser sessions.
- Restricted HTTP(S) navigation to public addresses.

## Known limitations
This is a prototype, **not** a hardened publicly hosted browsing service. Application-level DNS checks are not a sufficient SSRF defense; enforce network-level denial of internal/private addresses before exposing it to untrusted users. Navigation to private network resources is denied on a best-effort basis. Frame delivery is JPEG at roughly 4 FPS with no audio. No clipboard, uploads, downloads, browser tabs, DRM or persistence. Some websites may decline to run under automated remote browsers. It does not guarantee bypass of network filtering systems.
