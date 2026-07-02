# UX Audit — July 2026

**Status: all findings below (4 high, 7 medium, 8 low) have been fixed** in three follow-up commits on this branch, in the suggested order — quick wins, then keyboard/dialog a11y, then the product-level items. Each fix was verified live (Playwright) after implementation, not just typechecked. Two additional bugs were found and fixed only by testing the fixes themselves: Radix Dialog's `pointer-events: none` on `<body>` making the Sonner toast unclickable while a modal is open, and onboarding coach marks (portaled to `document.body`) still rendering on top of overlay routes despite the `inert` fix. See the git log on this branch for the four fix commits.

Method: live walkthrough of the running app (Chromium via Playwright, 1280×800 and 390×844), keyboard-only passes, reduced-motion emulation, and a code review of the flagged areas. Every finding below was verified against the running app and/or pinned to source.

## What's working well

Before the issues: the app has genuinely strong UX fundamentals worth preserving.

- Every icon button tested has an accessible name (automated scan found **zero** unnamed interactive elements across Landing, editor, picker, and arrange views).
- Empty states are consistent and inviting (`EmptyTapCard` everywhere), destructive flows like New Song and section delete are properly guarded, and Spice/preset commits get 5-second undo toasts.
- CTA copy adapts to input ("Click to…" with a mouse, "Tap to…" on touch).
- Focus rings are visible on the sculpted buttons; the chip-scatter background is `aria-hidden` and static (no motion issue there).

## High severity

### H1. Keyboard focus is trapped behind overlay pages
`src/App.tsx:136-144`, `src/App.tsx:29-31`, `src/pages/Landing.tsx:180`

`<Index />` (the full editor) is always mounted; Landing, Help, Defaults, and the 404 render as fixed overlays on top of it. Nothing marks the covered editor as inert, so every one of its controls stays in the tab order. Measured on `/`: the **first 22 Tab stops are invisible controls** (hidden Play button, hamburger, song-title textarea, Record…) before the first visible Landing CTA is reached at Tab 23. A keyboard user can trigger playback or recording on a screen they cannot see; a screen-reader user hears the whole editor "behind" the landing page.

**Fix:** set the `inert` attribute on the `<Index />` wrapper whenever an overlay route is active (and on `FullScreenOverlay`'s sibling). One state flag derived from `useLocation()` covers all four overlay routes.

### H2. The Help manual documents a previous version of the app
`src/pages/Help.tsx:22-32`, `178-180`, `237-239`

The manual is branded **"SongNote"**, says the app has "three tabs — Lyrics, Chords, Progressions", and its screenshots show an old dark UI with that tab strip. The shipping app is branded **"felt."** and navigates via "1. Write and Record / 2. Arrange". A new user who opens Help & User Manual is told to look for UI that doesn't exist. `document.title` is also set to "… · SongNote".

**Fix:** rewrite the copy around the Write/Arrange model, retake the screenshots, and update titles/alt text. This is the single most misleading thing a curious new user can run into.

### H3. "Use Offline" is promised, but fonts and the app shell need the network
`index.html:10-12`; no service worker or manifest (`public/` has only favicon/robots)

The tagline says "Use Offline. Save Locally." Data is indeed local, but all five font families (Zain, Nunito, JetBrains Mono, Noto Music, Caveat) load from Google Fonts, and there is no service worker, so nothing caches the shell. When the CDN is unreachable the entire brand typography silently degrades to fallback serif/sans — this audit ran in that state and every screenshot shows it — and the `𝆑` logomark depends on Noto Music, so offline users can get a tofu box as the brand mark. A hard refresh with no network fails outright.

**Fix:** self-host the fonts (e.g. `@fontsource/*` imports bundled by Vite) and consider `vite-plugin-pwa` for shell caching, or soften the tagline.

### H4. Mobile chord editor is not a dialog and ignores Escape
`src/components/lyrics/FocusedChordEditor.tsx:360`

The mobile bottom-sheet chord editor is a hand-rolled `fixed inset-0 z-50` div: no `role="dialog"`, no `aria-modal`, no focus trap, and — verified live — **Escape does not close it** (desktop's Radix-based picker closes fine). External-keyboard and screen-reader users on mobile get a full-screen takeover with no announced context and no standard exit.

**Fix:** host it in the same Radix `Sheet` the desktop picker uses, or add `role="dialog"`, `aria-modal`, a keydown-Escape handler, and a focus trap.

## Medium severity

### M1. Chord "Preview" buttons are nested inside buttons and unreachable by keyboard
`src/components/chord/ChordPickerSheet.tsx:337-344` (mobile), `371-378` (desktop)

The per-suggestion play/preview control is a `<span role="button">` **inside** the chord `<button>`. Interactive-inside-interactive is invalid HTML, the span has no `tabIndex` or key handler, so keyboard users can pick a chord but can never audition it first — auditioning is the core value of the picker.

**Fix:** render the preview as a real sibling `<button>` positioned over the card, or make the whole card a div with two real buttons inside.

### M2. Add Chords sheet has no accessible title
`src/components/chord/ChordPickerSheet.tsx:204-205`

Radix logs `DialogContent requires a DialogTitle` the moment the sheet opens (reproduced live). The visible "Add Chords" header is plain text, so screen readers announce an untitled dialog.

**Fix:** wrap the existing header text in `SheetTitle` (or add a `VisuallyHidden` one).

### M3. Removing inspiration photos is destructive with no confirmation or undo
`src/components/header/TransportHeader.tsx:405-413` ("Remove this photo"), `414-422` ("Remove all photos")

Both fire immediately. Photos are user-uploaded and not recoverable after removal — one mis-tap on "Remove all photos" (styled in red, right next to "Remove this photo") wipes them. This is inconsistent with the app's own well-guarded New Song and delete-section flows.

**Fix:** reuse `ConfirmDeleteDialog` for "Remove all", or make both undoable via the existing toast-undo pattern.

### M4. The inspiration lightbox is a hand-rolled modal with no dialog semantics
`src/components/header/TransportHeader.tsx:338-426`

No `role="dialog"`, no focus trap, no Escape, no arrow-key navigation (prev/next are mouse-only), and it's styled entirely with hardcoded `rgba()` values instead of the oklch tokens the rest of the app uses. "Tap outside to close" is the only exit affordance.

**Fix:** rebuild on Radix `Dialog` (Escape/focus handling for free), add arrow-key handlers, and restyle with tokens.

### M5. "Skip Tutorial" overlaps the Record button on phones
`src/components/onboarding/SkipTutorialButton.tsx:31` (`fixed bottom-4 left-4`) vs the bottom sticky bar

At 390px the pill sits on top of the red Record button (screenshot captured). During first run — exactly when the tutorial is showing — the primary capture action is partially covered and mis-taps are likely.

**Fix:** at narrow widths dock the skip button above the sticky bar (e.g. `bottom-20`) or render it inside the bar's layout.

### M6. The Defaults page is unreachable, and one of its settings is dead
`src/App.tsx:139` (route exists; zero in-app links), `src/store/defaults.ts:13-85`

`/defaults` can only be reached by typing the URL — the hamburger menu has no entry. Separately, `defaultLandingTab` is persisted in the store but **never read by any component**, and isn't even exposed on the Defaults page.

**Fix:** add a "Defaults" item to the menu's settings group; delete `defaultLandingTab` (or wire it up).

### M7. Returning users must scroll to resume their song; removal has no undo
`src/pages/Landing.tsx:251` (recents section), `:300` (Remove from recents)

"Recent Projects" sits below the fold at 800px — the most likely action for a returning user (continue the song) is the least visible. The only menu action, "Remove from recents", takes effect immediately with no confirm or undo toast (verified live).

**Fix:** hoist the most recent project into a "Continue where you left off" card near the CTAs; add an undo toast to removal.

## Low severity / polish

### L1. Landing logomark has no text alternative (and no h1)
`src/pages/Landing.tsx:184-206` — the `𝆑elt.` wordmark is bare Noto Music glyphs in spans; screen readers get "forte symbol… elt." at best, and the page has no h1. (The header copy at `TransportHeader.tsx:781-793` is fine — it's inside a Link labeled "Return to introduction".) **Fix:** wrap in `<h1 role="img" aria-label="felt.">`.

### L2. 404 page drops the design system and forces a full reload
`src/pages/NotFound.tsx:3-9` — plain `bg-muted` look (no paper tokens, no display font) and a raw `<a href="/">` that reloads the SPA and ignores the router basename on subpath deploys. **Fix:** react-router `Link` + paper/sculpt styles.

### L3. Defaults number inputs fight the user
`src/pages/Defaults.tsx:49,63,77` — `Number(value) || FALLBACK` snaps the field back the instant it's cleared, so you can't clear-and-retype; values outside the stated min/max are also accepted (only HTML hints enforce them). **Fix:** keep a string draft while editing, clamp on blur.

### L4. Onboarding squiggle ignores reduced motion
`src/index.css:549-554` — `onb-squiggle` runs `1s linear infinite` and is missing from the `prefers-reduced-motion` block at `:600-604` (which correctly gates the three pulse/glow animations). **Fix:** add it to that block.

### L5. Menu groups app-level items under "Project Settings"
The hamburger sheet's "Project Settings" card contains Help & User Manual, Dark mode, and Turn on Tutorial — app-level concerns, not project ones (`TransportHeader.tsx` menu). **Fix:** split into "Project" and "App" groups (a natural home for the Defaults link from M6).

### L6. Design-token drift on the landing tagline
`src/pages/Landing.tsx:32-38` — chip backgrounds and text use literal `oklch(...)` strings instead of the section-tint/ink tokens. **Fix:** move to CSS variables so theme/tint changes propagate.

### L7. Slow work has no visible progress affordance
`src/components/ui/skeleton.tsx` ships but is used nowhere; take transcription (a slow web-worker job) tracks status in `src/store/transcription.ts` but shows no spinner/skeleton in the recordings strip. **Fix (opportunity):** surface transcription status on the take card.

### L8. Onboarding is long but escapable
The tour is 13 steps with per-step dismissals. Skip Tutorial is always visible (good), and the coach marks are charming — but 13 steps front-loads a lot. Consider trimming to the 5–6 steps that map to the first-session path and letting the rest trigger contextually. Observation, not a defect.

## Suggested fix order

1. **Quick wins (one small PR):** M2 sheet title, L4 reduced-motion, L2 404 page, L1 logomark label, L6 tagline tokens, L3 number inputs.
2. **Keyboard & dialog a11y (the substantive PR):** H1 inert overlays, H4 mobile sheet semantics, M1 preview buttons, M4 lightbox rebuild.
3. **Product-level decisions:** H2 Help rewrite, H3 font self-hosting / offline story, M3 photo confirmations, M5 skip-button overlap, M6 Defaults discoverability, M7 landing recents.
