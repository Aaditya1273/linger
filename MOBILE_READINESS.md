# LINGER — Mobile Device Readiness

For the Decentraland Friendzone **Mobile** Buildathon.

Every claim below is labelled with how it was established. Nothing is called verified
because TypeScript compiled or a unit test passed.

| Label | Meaning |
|---|---|
| **STATIC VERIFIED** | Proven by reading or measuring the code, a build, or a test |
| **SIMULATED VERIFIED** | Proven by running the system headlessly (no Decentraland client) |
| **PHYSICAL DEVICE VERIFIED** | Proven on a real phone running the real Decentraland client |
| **UNVERIFIED** | Not established |

**No test in this document is PHYSICAL DEVICE VERIFIED.** I have no phone, no emulator, and
no Decentraland client on this machine — the SDK preview fails with
`"open decentraland://…" exited with code 127` (client not installed), and browser
automation reports no connected browser. Every row in the physical matrix is therefore
**UNVERIFIED** and needs a human with a handset.

---

## How to run the scene on a phone

```bash
cd scene
npm install
npm start -- --mobile        # prints a QR code; scan it from a phone on the same Wi-Fi
```

Other launch modes, from `sdk-commands start --help`:

| Flag | Use |
|---|---|
| `--mobile` | QR code for a device on the same network — **this is the one you want** |
| `--web` / `--bevy-web` | Browser explorer, useful as a desktop control |
| `--port <n>` | Change the port if 8000 is taken |
| `--no-client` | Serve only; do not auto-launch anything |

The server must be running too, or Echoes will not persist:

```bash
cd server && npm install && npm start
```

**Both phones must be on the same realm**, or they get different live rooms and can never
see each other or Bond. Tap the connection dot at the top of the screen to open the
developer diagnostic and compare the `realm` line on both devices. This is the single most
common way a two-device demo silently fails.

Files that define the mobile behaviour, if a test exposes something:

| Concern | File |
|---|---|
| Touch targets, safe zones, type scale | `scene/src/linger/ui/theme.ts` |
| All UI panels and the only two tappable elements | `scene/src/linger/ui/panels.tsx` |
| Echo world-space tap target | `scene/src/linger/echo/echoPool.ts` |
| Radii, durations, caps, network throttle | `scene/src/linger/config.ts` |
| Name truncation | `scene/src/linger/ui/text.ts` |

---

## Defects found and fixed during this pass

Two concrete defects, both found by measuring the code rather than by testing on a device.

### 1. Text overflow on long player names — FIXED

**STATIC VERIFIED.** The server permits display names up to 40 characters
(`normaliseIdentity` → `.slice(0, 40)`), and react-ecs `uiText` defaults to
`textWrap: 'wrap'`. A 40-character name at the Bond card's 34 px hero size needs roughly
760 px, but the card is 460 px wide with 44 px of padding — so it wrapped onto two or three
lines inside a container with a **fixed 44 px height**, and the overflow landed on top of
the text below it.

That is the Bond celebration, the emotional peak of the product, rendering as overlapping
garbage — and Decentraland names routinely carry a `#1234` suffix, so long names are normal
rather than exotic.

Eight sites were affected: Bond card (×2 names), Echo card, wave panel (×3 strings), return
panel, and the "someone left an Echo" toast.

**Fix:** one pure helper, `forDisplay()` in `scene/src/linger/ui/text.ts`, bounding names to
18 characters with an ellipsis, applied at all eight sites. Truncation is the smallest
change that actually bounds the problem — enlarging containers would not, because name
length is not bounded by anything the UI controls.

**Regression test:** 10 tests in `scene/test/text.test.ts`, including a guard that
`NAME_MAX` stays within what fits on one line at hero size. Confirmed to bite: restoring the
unsafe value of 40 fails 2 of them.

This also required a scene test harness, which did not exist (`npm test` in `scene/`).

### 2. Undersized touch target on the diagnostics control — FIXED

**STATIC VERIFIED.** The connection dot was `width: 64, height: 28` — a 64×28 tap target,
against the project's own 64 px minimum. 28 px is not reliably hittable with a thumb.

**Fix:** one line — the tappable box is now 64×64. The dot stays visually small; only the
hit area grew. The collapsed container grew with it so the box is not clipped.

**Both interactive elements in the entire UI are now 64×64** (verified: 2 `onMouseDown`
handlers exist in the whole scene, both inside components with `height: layout.touchTarget`).

---

## 1. BOOT

| # | Check | Status | Evidence / how to test |
|---|---|---|---|
| 1.1 | Production bundle is small enough for mobile data | **STATIC VERIFIED** | 537 KB (`stat bin/index.js` after `npm run build:prod`) |
| 1.2 | No 3-D assets to download | **STATIC VERIFIED** | Environment is engine primitives; 0 bytes of GLB/textures |
| 1.3 | World is built before any await | **STATIC VERIFIED** | `bootstrapLinger()` builds sanctuary, Hearth, pool and UI synchronously; identity/realm/connection are awaited after |
| 1.4 | Scene compiles and serves for mobile preview | **SIMULATED VERIFIED** | `sdk-commands start` reports `Found 0 errors`, server listens |
| 1.5 | World actually loads on a handset | **UNVERIFIED** | Scan the QR; the sanctuary, Hearth and Echo ring must appear |
| 1.6 | No fatal runtime errors in the mobile client | **UNVERIFIED** | Watch the client log during boot |
| 1.7 | Loading experience is acceptable | **UNVERIFIED** | Time from scan to walkable |
| 1.8 | Guest login works | **UNVERIFIED** | Enter as guest; expect a `guest:` identity in the diagnostic |
| 1.9 | Wallet login works | **UNVERIFIED** | Enter with a wallet; diagnostic must read `wallet (signature verified)` |
| 1.10 | Boots with the server down | **STATIC VERIFIED** (code) / **UNVERIFIED** (device) | World is explorable offline by construction; connection dot shows hollow |

## 2. TOUCH

| # | Check | Status | Evidence / how to test |
|---|---|---|---|
| 2.1 | No keyboard dependency anywhere | **STATIC VERIFIED** | `grep -rn "inputSystem\|IA_ACTION\|onKeyDown" src/` → **NONE**. Only `InputAction.IA_POINTER` |
| 2.2 | Exactly two interactive UI elements, both 64×64 | **STATIC VERIFIED** | 2 `onMouseDown` handlers; both in components with `height: layout.touchTarget` |
| 2.3 | Echo tap target is generous in world space | **STATIC VERIFIED** | `MeshCollider.setCylinder(body, 0.55, 0.26)` — ~1.1 m wide at the base, ~1.19 m tall |
| 2.4 | Head and label are not tap targets | **STATIC VERIFIED** | Collider on the body only, so they cannot steal a tap |
| 2.5 | Movement via virtual joystick | **UNVERIFIED** | Walk a full circuit of the Echo ring |
| 2.6 | Camera drag | **UNVERIFIED** | No LINGER element may steal the gesture |
| 2.7 | Echo selection while walking past | **UNVERIFIED** | Rough thumb tap must select |
| 2.8 | Heart | **UNVERIFIED** | Expect *"You left a Heart."* |
| 2.9 | High-five | **UNVERIFIED** | Expect *"You high-fived their Echo."* |
| 2.10 | Wave (needs 2 devices) | **UNVERIFIED** | Button appears within 4 m of another player |
| 2.11 | Bond interaction | **UNVERIFIED** | See §4 |
| 2.12 | Every modal can be dismissed | **STATIC VERIFIED** | Echo card, return panel and Bond card each have a close action; no code path opens an overlay without its model |
| 2.13 | Android back button behaviour | **UNVERIFIED** | Must not trap or exit unexpectedly |

## 3. UI

| # | Check | Status | Evidence / how to test |
|---|---|---|---|
| 3.1 | Bottom 34% reserved for client controls | **STATIC VERIFIED** | `layout.reservedBottom` applied to every modal card |
| 3.2 | At most one modal at a time | **STATIC VERIFIED** | `ui.overlay` is a single enum; root renders one branch |
| 3.3 | At most three actions on screen | **STATIC VERIFIED** | Echo card offers exactly Heart / High-five / Note |
| 3.4 | No text overflow from long names | **STATIC VERIFIED** | Defect 1 fixed; 10 regression tests |
| 3.5 | Portrait layout | **UNVERIFIED** | All UI reachable, nothing clipped |
| 3.6 | **Landscape on a short viewport** | **UNVERIFIED — HIGHEST-PRIORITY RISK** | See Risk R1 below |
| 3.7 | Small Android screen (~5.5") | **UNVERIFIED** | Cards fit; no clipping |
| 3.8 | Large screen / tablet | **UNVERIFIED** | Cards stay centred, capped at 460 px |
| 3.9 | Rotation mid-interaction | **UNVERIFIED** | An open card must survive |
| 3.10 | Notch / punch-hole | **UNVERIFIED** | Top band must not be obscured |
| 3.11 | Readable in daylight | **UNVERIFIED** | Warmth bar and prompt legibility |
| 3.12 | Longest note (140 chars) fits its card | **UNVERIFIED** | Server-capped; container is 60 px, so **check this specifically** |

## 4. SOCIAL — the judge journey, two phones

| # | Check | Status | Evidence / how to test |
|---|---|---|---|
| 4.0 | **Both phones report the same realm** | **UNVERIFIED** | **Do this first.** Tap the dot on both; compare `realm`. Different realms ⇒ 4.5–4.8 cannot pass |
| 4.1 | Phone A lingers 20 s and creates an Echo | **UNVERIFIED** | *"You left an Echo here."* |
| 4.2 | Phone B sees A's Echo | **UNVERIFIED** | Cool blue, top of the ring, A's name |
| 4.3 | Phone B interacts | **UNVERIFIED** | Heart and High-five both land |
| 4.4 | Phone A returns and gets "While You Were Away" | **UNVERIFIED** | Appears ~4 s after arrival. **Requires a wallet on A** — a guest is a new identity each session |
| 4.5 | Both players see each other | **UNVERIFIED** | Native Decentraland comms |
| 4.6 | Wave is reciprocal | **UNVERIFIED** | *"X waved at you"* then *"Stay with X a little longer…"* |
| 4.7 | Bond forms after ~30 s together | **UNVERIFIED** | Celebration card on **both** phones |
| 4.8 | Bond stone persists for a third visitor | **UNVERIFIED** | Phone C sees it near the Hearth |
| 4.9 | Server rules behind all of this | **SIMULATED VERIFIED** | `npm run test:journey` drives the whole loop over the live protocol with real signatures |

## 5. PERFORMANCE

| # | Check | Status | Evidence / how to test |
|---|---|---|---|
| 5.1 | Entity budget is bounded and does not grow with traffic | **STATIC VERIFIED** | 190 baseline, 350 ceiling with 40 Bond stones (counted from source) |
| 5.2 | Echo visuals are pooled, never created per frame | **STATIC VERIFIED** | 18 fixed slots; pointer handlers registered once at construction |
| 5.3 | No per-frame network writes | **STATIC VERIFIED** | Presence ≤1/s and only after moving ≥0.75 m; a stationary player sends nothing |
| 5.4 | No per-frame allocation in the UI | **STATIC VERIFIED** | Warmth label memoised, progress bar quantised to 2% steps, return lines built once |
| 5.5 | No ECS systems; everything on sized timers | **STATIC VERIFIED** | Hearth 250 ms, presence 1 s, expiry 30 s |
| 5.6 | **Frame rate on a real device** | **UNVERIFIED** | **No FPS number is claimed anywhere in this repository** |
| 5.7 | Startup time on a handset | **UNVERIFIED** | Measure scan → walkable |
| 5.8 | Memory over a 10-minute session | **UNVERIFIED** | Watch for growth |
| 5.9 | Behaviour on 3G / lossy Wi-Fi | **UNVERIFIED** | Throttle and observe |
| 5.10 | UI responsiveness with 18 Echoes visible | **UNVERIFIED** | Tap latency at the pool cap |

## 6. FAILURE RECOVERY

| # | Check | Status | Evidence / how to test |
|---|---|---|---|
| 6.1 | Reconnect is bounded and backed off | **STATIC VERIFIED** | 5 attempts, linear backoff, then stops; World stays explorable |
| 6.2 | Malformed or stale Echo cannot crash rendering | **STATIC VERIFIED** | Every inbound record passes `network/decode.ts`; undecodable records are dropped and logged |
| 6.3 | Expired Echo closes its open card | **STATIC VERIFIED** | `onEchoRemoved` → `closeOverlay` |
| 6.4 | Server restart recovery | **SIMULATED VERIFIED** | `npm run test:resilience` kills and restarts the server; client re-arms with *"The Hearth was rekindled."* |
| 6.5 | Lingering while disconnected is refused, not silently lost | **STATIC VERIFIED** | Explicit message; Echo is never faked locally |
| 6.6 | Airplane-mode toggle on device | **UNVERIFIED** | Dot goes hollow, then reconnects |
| 6.7 | **App background → foreground** | **UNVERIFIED — HIGH RISK** | See Risk R2 |
| 6.8 | Server unavailable at boot | **UNVERIFIED** | World must still load and be walkable |
| 6.9 | Wallet rejection during login | **UNVERIFIED** | Must fall back to guest, not hang |

---

## Risks

**R1 — Base UI column may overflow a short landscape viewport. HIGH.**
The always-on UI is a fixed-pixel column: warmth bar (72) + diagnostics (64) + prompt (160)
+ wave panel (138) + toast (52) ≈ **486 px**, and ~628 px with the diagnostic expanded.
Phone landscape viewports are often shorter than that. Children have fixed heights and no
`flexShrink`, so Yoga will overflow rather than compress — which could push the wave button
into the reserved bottom band or off-screen, breaking the Bond flow specifically in
landscape. I did not redesign the layout speculatively; this needs one device to confirm.
If confirmed, the smallest fix is a landscape branch that hides the toast and collapses the
prompt.

**R2 — Backgrounding the app. HIGH.**
Mobile OSes suspend timers and may drop the WebSocket. The Hearth timer, presence reporting
and Bond qualification all run on `utils.timers`. Behaviour on resume is untested: a linger
in progress may complete late, and Bond "time together" may be miscounted. No code change
made without evidence.

**R3 — "While You Were Away" requires a wallet. MEDIUM, by design.**
Guests get a session-scoped identity, so a returning guest is a new person and has no return
activity. Correct security behaviour, but it means the retention beat only demos with a
wallet-connected player. Plan the demo accordingly.

**R4 — Server restart wipes all history. MEDIUM.**
`MemoryPersistence` is the only implemented adapter. Start the server once and leave it up.

**R5 — Two phones on different realms cannot Bond. MEDIUM, mitigated.**
Decentraland may place players on different islands. The diagnostic exists to catch this;
check 4.0 before demonstrating.

**R6 — 140-character notes in a 60 px container. LOW.**
Notes are server-capped at 140 but render into a fixed-height box. Names are now bounded;
notes are not. Untested on a narrow screen — check 3.12.

---

## Final verification

Run at the end of this pass, after both fixes:

```
Foundry contract tests     55 passed, 0 failed
Server unit tests         157 passed, 0 failed
Server journey (live)      PASS
Server resilience (live)   PASS
Scene tests (new)          10 passed, 0 failed
Scene typecheck            0 errors
Server typecheck           0 errors
Scene production build     537 KB
Mobile structural checks   keyboard deps: NONE
                           interactive elements: 2, both 64x64
                           Echo world tap target: ~1.1 m
```

---

## MOBILE_READY: PARTIAL

Everything that can be established without a handset has been, and two genuine defects were
found and fixed in the process. Nothing has been proven on a phone.

**BLOCKERS**

1. No physical Android device, emulator, or Decentraland client is reachable from this
   machine. The SDK preview fails with `exited with code 127`; browser automation reports no
   connected browser. **Every physical row is UNVERIFIED and only a human can close them.**
2. Two devices and one wallet are needed for §4 — the journey that decides the buildathon.

**RISKS** — R1 landscape overflow (HIGH), R2 background/foreground (HIGH), R3 wallet-gated
return experience, R4 restart wipes history, R5 realm mismatch, R6 long notes.

**EXACT USER TESTS REQUIRED**, in priority order:

1. **§4 end to end on two phones**, starting with 4.0 realm match. This is the demo; if it
   works, the buildathon story holds.
2. **3.6 landscape on the smallest phone available** — the top unverified structural risk.
3. **6.7 background the app mid-linger, then resume** — the top unverified runtime risk.
4. **1.5–1.9 boot and login**, guest and wallet.
5. **2.5–2.9 touch loop**: walk, tap an Echo, Heart, High-five.
6. **3.12 a 140-character note** on a narrow screen.
7. **5.6–5.8 frame stability, startup, memory** — record real numbers; none are claimed here.
