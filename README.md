# Ryftipe

Ryftipe is an experimental remotely rendered Chromium browser. Its Chromium browser runs on the server; your browser receives JPEG frames through a WebSocket and sends mouse and keyboard input back.

## Run locally
Node.js 22+ required. The npm install step installs the matching Chromium binary automatically.

```sh
npm install
npx playwright install --with-deps chromium
npm start
```

Open http://localhost:3000. No password is required by default. To enable private mode, set `RYFTIPE_PASSWORD` to a password of at least 12 characters before starting.

## Deploy with Render
Create a Blueprint from `render.yaml`. The service starts without a password by default. For a private deployment, optionally configure `RYFTIPE_PASSWORD` with a unique strong password. This project includes a Playwright Chromium Docker image. Use a paid instance with sufficient memory for Chromium. Render needs to permit WebSockets.

### Existing Render Node.js service

If your current service uses Render's **Node** runtime rather than Docker, set:

- Build Command: `npm install && npx playwright install chromium`
- Start Command: `npm start`

The package also has a `postinstall` hook to install the Chromium binary during normal Node builds. If Render reports missing Chromium shared libraries after that, deploy through the provided **Docker** blueprint instead, which includes Playwright's OS dependencies. Set `PLAYWRIGHT_BROWSERS_PATH` consistently if you override it, and don't enable `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` on native Node builds.

## Initial features (v0.1.2)
- Remote Chromium with screenshot streaming.
- URL navigation, back/forward, reload, mouse click and scroll, keyboard and viewport resize.
- Optional password-protected login (disabled by default) and isolated ephemeral browser sessions.
- Restricted HTTP(S) navigation to public addresses.

## Security note
Public mode means anyone with the deployment URL can start a resource-intensive browser session (up to `MAX_CLIENTS` simultaneous sessions). Use private mode when possible, and add deployment/network-level protection before making a production service available to others. Do not trust the application-layer URL checks as a complete SSRF defense.

## Known limitations
This is a prototype, **not** a hardened publicly hosted browsing service. Application-level DNS checks are not a sufficient SSRF defense; enforce network-level denial of internal/private addresses before exposing it to untrusted users. Navigation to private network resources is denied on a best-effort basis. Frame delivery is JPEG at roughly 4 FPS with no audio. No clipboard, uploads, downloads, browser tabs, DRM or persistence. Some websites may decline to run under automated remote browsers. It does not guarantee bypass of network filtering systems.
