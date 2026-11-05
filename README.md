# Ryftipe

Ryftipe is an experimental browser interface with two website engines: the original Ryftipe Rendering Engine (RTE), and an optional Chromium fallback running remotely. RTE renders HTML/CSS via Canvas; Chromium sends JPEG frames via WebSocket. Neither engine is a complete replacement for a mainstream browser.

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

## v0.10.0 — RTE compatibility and browser tools capstone

- Experimental **Flexbox row and Grid track sizing**, including fractional columns, \`repeat(N, ...)\`, basic gaps and simple flex-grow. These are **subsets**, not CSS standards compliance; wrapping, intrinsic sizes, alignment and complex layouts remain incomplete.
- User-initiated **GET HTML forms** with URL query encoding, input prompts, checkbox/radio and select-value serialization. POST, uploads and advanced form validation remain unsupported.
- **RTE page zoom** from 50% to 200% with toolbar controls and Ctrl+Plus/Minus/0.
- **Find in Page (Ctrl+F)** searches currently painted text tokens and scrolls to matches. It does not yet search across multiple tokens or remote Chromium websites.
- **\`ryftipe://engine\` diagnostics** for draw-command count, page height, current URL, zoom, scripting status and honest capability/limitation information.
- Keeps homepage-on-launch, flags, bookmarks shelf, search preferences and Chromium fallback.
- Additional deterministic tests for CSS track sizing, forms and layout behavior.
- **YouTube remains unsupported in RTE:** media playback, modules, advanced DOM APIs and WebGL are not available. This release does not claim otherwise.
- Network request filtering remains best effort and is not a security guarantee for public deployments; secure network-layer egress restrictions are recommended.
- No accounts/PostgreSQL introduced.

## v0.9.0 — Bookmarks bar and RTE layout repair

- Persistent bookmark shelf below the address bar. Star button saves the current website, saved sites open on click, and the trailing menu opens bookmark management.
- `Ctrl+Shift+B` toggles the shelf through the `bookmarks-bar` flag on `ryftipe://flags`.
- The RTE canvas renderer now uses a separate, testable layout stage that generates box and inline text draw commands. Adjacent inline elements share line boxes instead of always starting new lines; long words wrap.
- Improved basic block spacing and alignment, CSS box backgrounds, responsive widths, and text styles.
- Unstyled HTML pages receive an optional basic reader presentation rather than a blank white sheet; this is an approximation, not native browser-equivalent CSS.
- Existing tabs remain lightweight navigation tabs, not concurrently active site sessions.

## v0.8.0 — Browser foundations capstone (Brave-inspired UX)

- **ryftipe://flags:** searchable experimental flag controls, explicit defaults, persistent local values, reset-all, and live application of supported options. These are Ryftipe flags—not Chromium internals.
- **Navigation tabs:** up to 10 URL-backed tabs with new/close/switch buttons and Ctrl+T, Ctrl+W, Ctrl+Tab. **These are lightweight navigation tabs:** switching back to an external site reloads it; they do not hold multiple independent live Chromium sessions.
- **Browser menu:** shortcuts to home, bookmarks, history, privacy, flags, site permissions, settings and about.
- **Search preferences:** DuckDuckGo (default), Brave Search, Google and Bing. Searches entered in the address bar use the chosen engine.
- **Privacy center:** enable/disable local history recording, clear local history/bookmarks/site permissions, and per-domain RTE JavaScript permissions. No false claim of tracker blocking or private browsing isolation.
- **Feature toggles:** RTE scripts, RTE images, compatibility warnings, performance readout, compact toolbar, reduced motion and homepage shortcuts.
- **Startup:** always opens ryftipe://home, even after visiting external websites.
- **Storage:** preferences remain in this browser's localStorage; no PostgreSQL/accounts yet.
- **Known limitations:** no extensions, downloads manager, full multi-process tabs, sync, network-wide shields, media/WebRTC, or parity with Brave/Chromium.

## v0.7.0 — CSS and compatibility improvements

- Fixes CSS rendering in RTE with separate CSS parsing, selector matching (including descendants), specificity/cascade, inherited styles, basic CSS variables, CSS lengths and box spacing.
- External public HTTPS/HTTP stylesheets are fetched through guarded RTE resources, including CDNs; limited to eight stylesheets and a combined 380 KB.
- Removes the hard-coded JavaScript-heavy-site stop. RTE now **attempts** those websites, including YouTube, with a nonblocking compatibility warning and fallback option.
- Basic viewport-width media queries and page background painting are supported. Flexbox, Grid, CSS animations, many pseudo-selectors, JS framework APIs, YouTube media playback, WebGL and audio remain incomplete.
- The original engine is still experimental. Network-layer egress filtering is required before exposing RTE publicly.

## v0.6.0 — Experimental JavaScript compatibility

- RTE can execute a limited number of classic scripts in a sandboxed, opaque-origin iframe. Site JavaScript runs in the host browser's JavaScript engine, **never** in Ryftipe's privileged page or Node server.
- A controlled DOM mirror sends bounded mutation snapshots to RTE for painting. Supports common native document APIs such as getElementById, querySelector, createElement, addEventListener, timers, textContent and classList.
- Script loading from same-origin URLs through the guarded fetch endpoint, bounded script count and size, plus inline classic scripts. Modules, cross-origin scripts and dynamic script imports are not supported.
- CSP blocks network and frame access from the sandbox; only a restricted message bridge returns DOM changes. The browser's sandbox attribute denies same-origin, popups and top-level navigation.
- Settings toggle to disable/enable site JavaScript; status at `ryftipe://javascript`.
- No audio/video, WebGL, full DOM/CSS standards, fetch/XHR or modern JavaScript framework compatibility. **YouTube still cannot run in RTE**. Use Chromium fallback for those sites.
- This is an experimental sandbox and must not be treated as a fully audited security boundary. Run in a controlled environment and apply egress restrictions on Render.

## v0.5.0 — Theme and compatibility capstone

- Persistent dark/light theme toggle in the toolbar and settings. Theme styles affect Ryftipe's own UI, not external websites.
- A clear compatibility explanation replaces blank/fragmented RTE rendering for script-heavy dynamic sites. The user can switch to Chromium fallback from the page. **YouTube is still not supported in the original RTE engine**; Chromium fallback still has video streaming limitations.
- Direct bookmark toolbar button; Ctrl+D to bookmark and Alt+Left to go back.
- Chromium navigation requests are now queued while its fallback session starts, rather than lost.
- Reports JavaScript dependence and script count from the HTML fetcher (heuristic; not perfect).
- Startup continues to always show `ryftipe://home` as requested.

## v0.4.2 homepage on every launch

- On initial application load, always display `ryftipe://home` rather than reopening the last internal page or loading an external URL.
- This applies to refreshes and new sessions as well as both rendering-engine modes.
- Other internal pages remain accessible from the address bar and UI during the running session. Reloading the application returns to Home.
- Direct web query links (`/?page=settings` etc.) now also land on Home because startup prioritizes the homepage.

## v0.4.1 internal page routing fix

- Internal pages boot without awaiting the experimental RTE module.
- Internal routes are addressable through Ryftipe's address bar (`ryftipe://settings`) and directly via web URLs such as `/?page=settings`, `/?page=gpu`.
- Web-link routes survive refresh; browser Back/Forward within internal pages now uses web history.
- Note: `ryftipe://` is a virtual address recognized inside the Ryftipe app; entering it into Chrome's **outer** address bar cannot work without installing a system protocol handler.

## v0.4.0 original Ryftipe Engine (RTE)

An experimental original HTML tokenizer, DOM-like tree builder, CSS subset parser, Canvas2D painting/layout, images, scrolling, clickable links, history navigation. RTE is the default mode; Chromium is a fallback selectable at ryftipe://settings. Remote scripts are not executed.

**Limitations**: no JavaScript DOM, Flexbox/Grid, fully functional forms, WebGL, media decoding, audio/video or browser standards compliance. YouTube will not work in RTE mode; use Chromium fallback. The Canvas2D draw primitives are provided by the host browser; HTML and CSS parsing/layout are RTE code. Network safeguards are best effort; a public deployment also needs network egress filtering against SSRF.

## v0.3.0 internal browser pages

Ryftipe now has an instantly rendered local home page and internally routed `ryftipe://home`, `ryftipe://newtab`, `ryftipe://settings`, `ryftipe://gpu`, `ryftipe://bookmarks`, `ryftipe://history`, `ryftipe://about`, and `ryftipe://help` pages.

These pages are rendered in the frontend, rather than navigated inside remote Chromium. The GPU diagnostic endpoint uses Chromium's DevTools SystemInfo protocol to report the **server's** GPU feature statuses, devices, architecture and browser version. No claims are made that a GPU is available on Render.

Preferences, history and bookmarks are stored in localStorage **on this device only**. No accounts or PostgreSQL have been introduced, as requested. These records can be lost when browser storage is cleared or the deployment origin changes.

## v0.2.0 capstone: quality and interface

- Chromium DevTools Protocol screencasting replaces the slow polling screenshot loop.
- Binary WebSocket frames remove the Base64-JSON overhead between server and client.
- High-quality JPEG presets: Fast (62, 85% dimensions), Balanced (82), Sharp (92).
- Per-session FPS and bitrate status, throttled frame delivery and queue backpressure.
- Canvas display with image decoding and frame coalescing, remote input and resize.
- Completely redesigned midnight-blue browser chrome with stream settings panel.
- Chromium screencasting is **not WebRTC** and does not provide sound; maximum frame rate depends on Render CPU, network conditions and page behavior.

## Initial features (v0.1.2)
- Remote Chromium with screenshot streaming.
- URL navigation, back/forward, reload, mouse click and scroll, keyboard and viewport resize.
- Optional password-protected login (disabled by default) and isolated ephemeral browser sessions.
- Restricted HTTP(S) navigation to public addresses.

## Security note
Public mode means anyone with the deployment URL can start a resource-intensive browser session (up to `MAX_CLIENTS` simultaneous sessions). Use private mode when possible, and add deployment/network-level protection before making a production service available to others. Do not trust the application-layer URL checks as a complete SSRF defense.

## Known limitations
This is a prototype, **not** a hardened publicly hosted browsing service. Application-level DNS checks are not a sufficient SSRF defense; enforce network-level denial of internal/private addresses before exposing it to untrusted users. Navigation to private network resources is denied on a best-effort basis. Frame delivery is CDP JPEG screencast with variable FPS and no audio. No clipboard, uploads, downloads, browser tabs, DRM or persistence. Some websites may decline to run under automated remote browsers. It does not guarantee bypass of network filtering systems.
