## Goal

Make the onboarding sequence replay every time the user presses **Start Writing** (Landing) or **Start new song** (TransportHeader), unless the user has explicitly turned the tutorial off via the nav menu's **Disable Tutorial** toggle. That disabled state is the persistent override.

## Behavior

- `enabled` (persisted) is the master override.
  - When `enabled = true`: every Start Writing / Start new song fully resets onboarding progress so the phase-0 amber coach mark reappears.
  - When `enabled = false`: Start Writing / Start new song do nothing onboarding-related; no coach marks render.
- The nav menu's existing **Disable Tutorial** action keeps working; we also keep an **Enable Tutorial** action (already conditional) so the user can flip the override back on.

## Changes

### 1. `src/store/onboarding.ts`

Rewrite `resetForNewSong()` to fully restart the tour from the beginning (no `globalPhase >= 2` guard, no dependence on current step):

```ts
resetForNewSong: () => {
  if (!get().enabled) return;
  set({
    globalPhase: 0,
    lyricsStep: 0,
    progressionsStep: 0,
    showNewSongPrompt: false,
  });
},
```

Rationale: the guard previously prevented first-time runs from re-triggering, and never reset `globalPhase`, so persisted state from prior sessions silently suppressed PR #131's redesigned coach mark.

### 2. `src/pages/Landing.tsx`

`startWriting()` should also restart onboarding:

```ts
const startWriting = () => {
  resetSong();
  useOnboardingStore.getState().resetForNewSong();
  navigate("/app");
};
```

Add the `useOnboardingStore` import.

### 3. `src/components/header/TransportHeader.tsx` (Start new song handler, ~line 856)

Simplify to always call `resetForNewSong()` — it already no-ops when disabled — and drop `incrementNewSong()` from the onboarding-restart path (that counter drives the unrelated `showNewSongPrompt` flow; keep the call only if it is still needed for that prompt). Concretely:

```ts
resetSong();
onboarding.resetForNewSong();
onboarding.incrementNewSong(); // keep — drives the separate save reminder
setConfirmNewSong(false);
toast({ title: "New song started" });
```

(No `if (onboarding.enabled)` wrapper needed — `resetForNewSong` already short-circuits when disabled, and `incrementNewSong` is independent of the tutorial.)

### 4. Persisted-state migration (one-time unblock for existing users)

Bump the persist key so users whose stored `globalPhase` is currently `2` get a clean slate on next load:

```ts
{ name: "felt:onboarding:v2" }
```

Without this, returning users (including the current preview session) won't see the redesigned coach mark until they next press Start Writing / Start new song.

## Verification

- `npx tsc --noEmit`
- Manual: reload preview → amber phase-0 coach mark visible under tab strip (because key bump cleared old state).
- Press **Start new song** → coach mark reappears.
- Open nav → **Disable Tutorial** → press **Start new song** → no coach marks.
- Re-enable tutorial → **Start new song** → coach marks return.
- From `/` press **Start Writing** → land on `/app` with phase-0 coach mark visible (when enabled).
