

## Add Dark Mode Toggle

The app already has dark mode CSS tokens defined in `src/index.css` under the `.dark` selector — they just aren't wired up. This plan adds a theme provider and a toggle in the nav menu sheet.

### What you'll get
- A **Dark mode** toggle row inside the nav menu sheet (top-right Menu button), above Save/Load.
- Theme persists across reloads (saved to `localStorage`).
- Respects the user's OS preference on first visit.
- Smooth switch — all existing colors (paper, chord chips, ruled lines, playhead) already have dark variants and will swap automatically.

### Implementation

1. **New file `src/hooks/use-theme.tsx`**
   - Lightweight `ThemeProvider` + `useTheme()` hook.
   - Reads initial value from `localStorage` key `notebook-theme`, falls back to `prefers-color-scheme`.
   - Toggles the `.dark` class on `document.documentElement` and persists changes.

2. **`src/App.tsx`**
   - Wrap the app tree in `<ThemeProvider>` (outside `BrowserRouter`).

3. **`src/components/header/TransportHeader.tsx`**
   - Inside the nav `SheetContent`, add a row above the Save button:
     - `Sun`/`Moon` icon + label "Dark mode" + the existing `Switch` component (`@/components/ui/switch`).
     - Wired to `useTheme()`.

4. **`src/index.css`** (small polish)
   - Add `color-scheme: light` / `color-scheme: dark` under `:root` and `.dark` so native form controls (number input spinners, scrollbars) match the theme.

### Technical notes
- No changes needed to Tailwind config — `darkMode: ["class"]` is already set.
- No changes to existing components — they all use semantic tokens (`bg-paper`, `text-foreground`, `bg-chord-chip`, etc.) that already have `.dark` overrides.
- The toggle uses the existing shadcn `Switch` primitive at `src/components/ui/switch.tsx`.

### Files touched
- `src/hooks/use-theme.tsx` (new)
- `src/App.tsx`
- `src/components/header/TransportHeader.tsx`
- `src/index.css`

