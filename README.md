# Ryftipe Web

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

## v0.22.0 — Document layout architecture

- RTE's default webpage display uses **a script-disabled sandboxed HTML document** styled by the host browser's standards-based CSS layout engine, rather than hand-painted Canvas boxes.
- The backend provides bounded original HTML alongside CSS so the native HTML parser preserves semantic structures, SVG icons, and complex CSS layouts that the old simplified parser lost.
- Untrusted page markup is sanitized before rendering: scripts, event-handler attributes, executable embed elements, meta refresh, and dangerous URL schemes are stripped. The frame has `sandbox="allow-same-origin"` **without** `allow-scripts`, and links/forms are routed through Ryftipe navigation.
- Website JavaScript continues in the existing isolated opaque-origin runtime with restricted fetch/XHR/storage; dynamic script snapshots can update document rendering for marked dynamic sites.
- The previous Canvas implementation remains available behind the **Standards-based document layout** flag at `ryftipe://flags`.
- Added actual headless-browser layout tests for centered NoHello-style cards, CSS Grid/Flexbox, visual text, script blocking, and link navigation.
- This is a pragmatic **host-assisted renderer**, not a newly independent Chromium-class CSS engine. It does not make YouTube's full app, adaptive video streaming or DRM work.
- Site-specific browser verification is still necessary; automated fixtures cannot establish parity with all websites.

## v0.21.0 — RTE box geometry and content-sized flex layout

- Introduces a shared box geometry layer for centered max-width containers, padding, margins and border-box widths.
- Updates canvas box dimensions so backgrounds and content use a consistent coordinate convention.
- Flex item sizing begins with intrinsic text/control width, not equal-width columns. Implements a subset of justify-content alignment and proportional flex-shrink.
- Grid rows now respect row-gap, while column track widths account for column gaps.
- Adds deterministic regression fixtures for NoHello-style flex navigation, centered containers, grid row gaps, border-box sizing, flex growth and shrinking.
- This improves specific layout behavior but does not claim a fully standards-compliant layout engine or YouTube compatibility.
- Existing full-site probes remain informational; browser-level and real visual verification are still required.

## v0.20.0 — Native RTE controls and layout regression

- Replaces the previous fixed 360×36 generic form-control rendering with intrinsic text measurement, bounded CSS widths/heights, padding, colors and border radius.
- Draws text from real button children instead of rendering every button as "Submit".
- Adds a NoHello-style guide-button regression fixture confirming labels and separate compact controls are painted.
- Existing JavaScript event handling, site-storage isolation, and HTTP diagnostics are retained.
- Does not implement complete CSS layout or YouTube playback; real-site appearance must still be assessed after deployment.

## v0.19.0 — Integrated site storage and upstream error diagnostics

- RTE JavaScript now has bounded `localStorage` and `sessionStorage` shims rather than throwing opaque-origin SecurityErrors; persistent values are isolated by website origin inside Ryftipe's own namespaced browser storage.
- Website scripts do not receive the host application's localStorage, authentication tokens or other origins' values. Session data is discarded on navigation.
- Extended the headless Chromium integration test to verify sandboxed storage writes and reads alongside JavaScript modules, DOM events, fetch/XHR and Shadow DOM.
- Upstream site HTTP errors now retain their website status in RTE diagnostics, rather than becoming an opaque renderer error. A website that returns 418 may still refuse access.
- The experimental RTE remains incomplete: there is no full standards-compliant JavaScript/DOM/CSS/video implementation and YouTube playback is not working.

## v0.18.0 — Modern website CSS and rendering capstone

- Recursively loads bounded CSS `@import` dependencies (including CSS supplied by external stylesheets), preserves cascade order, resolves stylesheet-relative URLs, and reports per-page stylesheet successes/failures.
- Applies `@media` conditions for viewport width, print and light/dark color scheme instead of incorrectly applying dark and print styles everywhere.
- Adds basic `linear-gradient()` rendering on the RTE canvas. This is limited to straightforward color stops and directions, not full CSS Images Level 4.
- Improves selector matching for `:not()`, `:is()`, `:where()`; skips unsupported hover/focus and pseudo-element rules instead of applying them unconditionally.
- Indexes CSS rules by the final selector's ID/class/tag, raises supported rule budget, and avoids checking every style rule against every element.
- Adds real RTE metrics for CSS rule count, text runs, gradients, and stylesheet load failures in `ryftipe://engine`.
- Adds unit regressions for stylesheets, CSS color scheme, CSS gradients, selector matching, and a live `nohello.org` informational probe in CI.
- Does not claim complete CSS/DOM standards compliance or YouTube playback. Both require further work.

## v0.17.0 — Integrated DOM, event and networking capstone

- Adds a shared, validated **RTE event protocol** between the Canvas renderer and the sandboxed document.
- Canvas navigation now waits for JavaScript click handlers to run. `event.preventDefault()` can cancel the default navigation, and user-edited inputs generate real `input` and `change` events in the sandboxed DOM.
- Adds a narrow **XMLHttpRequest** compatibility class: asynchronous same-origin GET with `onload`, `onerror`, `readystatechange`, response text and JSON. Synchronous XHR, uploads, authentication, cross-origin requests and methods other than GET are unsupported.
- The sandbox's `fetch` and XHR share the read-only server request bridge. Browser credentials and cookies are not forwarded to untrusted sites.
- Integration tests now verify static module graphs, DOM mutation, Shadow DOM snapshots, JavaScript click cancellation, input updates, `fetch`, and XHR in one browser session.
- RTE still does **not** implement the full web platform; browser APIs, CSS layout, cross-origin resources, adaptive streaming, security hardening and YouTube playback remain incomplete.
- The YouTube live probe remains an **informational, nonblocking test**. Only a playable real video with advanced interaction would count as meeting the user goal.

## v0.16.0 — Static ES module dependency graph

- RTE resolves bounded, same-origin static ES module imports and re-exports.
- The isolated sandbox rewrites import specifiers to generated module blob URLs, preserving module dependency ordering.
- Bare package specifiers, cross-origin and dynamic imports, import.meta, cycles and oversized graphs remain blocked.
- The headless browser test now executes a module that imports a separate source module and updates the RTE DOM.
- YouTube itself is **not yet working** in RTE; its extensive browser API dependencies, layout and adaptive streaming remain unimplemented.

## v0.15.0 — Real YouTube compatibility probe

- Added a **real end-to-end headless Chromium test of Ryftipe Web in RTE mode navigating to an actual YouTube watch page**. It checks whether a locally rendered native video exists and whether its playback time advances.
- The probe is **informational and nonblocking**: failed YouTube compatibility is logged as `YOUTUBE_RTE_PROBE` with status and diagnostics; it does not falsely label an incomplete custom engine as YouTube-ready or prevent releases of unrelated fixes.
- Run manually after dependencies are installed with `npm run test:youtube`; GitHub Actions also runs it on each release build.
- Expect **YouTube NOT PLAYABLE in RTE** until modern module imports, browser APIs, Web Components layout and the adaptive media pipeline are complete.
- This is a test harness, **not** the finished YouTube implementation or evidence of normal-browser speed.

## v0.14.0 — RTE renderer paint scheduling and measurements

- RTE now schedules wheel-scroll and image-load repaints through `requestAnimationFrame`, avoiding redundant synchronous canvas paints.
- Measured last and moving-average canvas paint costs plus paint counts are available from `ryftipe://engine`.
- The timings measure the **RTE Canvas paint phase only**. They are not YouTube video FPS or page-load benchmarks, and do not prove browser-speed parity.
- Preserves previous native media, Shadow DOM snapshots, script-module experiment and same-origin GET data bridge.
- **YouTube remains unsupported** in this engine version.

## v0.13.0 — Open Shadow DOM support

- The experimental RTE script sandbox now serializes **open Shadow DOM trees**, making custom-element content visible in the RTE canvas snapshot renderer.
- ShadowRoot mutations trigger re-render snapshots, and hit testing can locate elements inside open shadow roots.
- Extended the real Chromium browser smoke test to verify custom-element shadow content alongside classic scripts, import-free modules and the network bridge.
- Incomplete: encapsulated CSS, slots, closed roots, full custom-element lifecycles, module imports and adaptive media.
- **YouTube still does not work in RTE.**

## v0.12.0 — RTE script and networking foundation

- RTE now extracts classic scripts **and ES modules** with an explicit execution type and increased bounded script budget.
- Experimental support for **import-free ES modules** via the opaque-origin JavaScript sandbox, alongside classic scripts. Module imports, dynamic imports, framework bundles and large script trees are not supported.
- Sandboxed website JavaScript can call `fetch()` for **same-origin GET JSON/text** through a bounded server resource handler. Methods other than GET, cross-origin requests, credentials and arbitrary binary responses are intentionally unsupported.
- New `rte-platform.js` centralizes request restrictions and script classification for unit testing. The RTE engine's diagnostics show executed, skipped and failed scripts and data-request counts.
- Added automated browser smoke coverage for sandboxed script execution and the limited network bridge, in addition to unit tests. **This is not a YouTube playback test.**
- The site remains an experimental engine. It does **not** yet run YouTube: full module resolution, DOM/Shadow DOM correctness, streaming APIs and browser-level performance remain missing.
- The server's public URL checks are not hardened against DNS rebinding; do not deploy an unprotected proxy or assume safe production isolation.

## v0.11.0 — RTE native-media foundation

**Goal:** full-speed playback of modern video sites using the RTE engine, while preserving portability to a future desktop application. **YouTube is not yet playable in RTE.**

- The original HTML parser now preserves `<video>`, `<audio>`, and nested `<source>` tags.
- RTE's box layout produces media draw commands at document coordinates. A separate local media layer places native video/audio elements at those coordinates and adjusts them for scrolling/zoom.
- Ordinary HTML5 media sources can play using the **client device's native decoding path**, instead of server-rendered screenshots. No YouTube iframe or separate YouTube player is used.
- Media elements preserve supported attributes, including controls, muted, loop, preload, and poster. Unmuted autoplay is blocked. Source URLs are restricted to HTTP(S).
- Media stops on page navigation or when leaving RTE, and existing players aren't recreated during ordinary scrolling.
- Added `ryftipe://media` diagnostic page for media capabilities and codec support.
- **Remaining blockers for YouTube:** full modern JavaScript/module execution, network APIs, Web Components/Shadow DOM, CSS correctness, MediaSource/streaming integration and actual video site compatibility.
- Native video playback requires a supported codec, valid media URL and site permissions. Browser media APIs are provided by the host platform; RTE controls HTML parsing, layout, positioning and the media lifecycle.
- No embedding, scraping YouTube streams, or claiming benchmark parity with a mainstream browser.

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
