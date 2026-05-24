# Plan

## 1. Pencil edit icon at 24px

In `src/components/chord/FloatingChordToolbar.tsx`, the floating trigger pencil currently uses `h-6 w-6` (24px) inside a `h-7 w-7` (28px) button — which crowds the icon. Update so the icon renders at a clean 24px:

- Change the trigger button from `h-7 w-7` to `h-10 w-10` so the 24px pencil has appropriate padding (matching other sculpted-amber controls).
- Keep `<Pencil className="h-6 w-6" />` (= 24px).

(No other Pencil icons are in scope — the small inline rename pencils in Progressions/Lyrics tabs stay at their current size.)

## 2. Collapse / Expand all sections works in Progressions tab

In `src/components/song/SongTitleHeader.tsx` the "Collapse/Expand all sections" menu item is currently `disabled={activeTab !== "lyrics"}`. The underlying store action (`setAllSectionsCollapsed`) already works for any tab, and Progressions also renders the same sections.

- Enable the menu item for both `lyrics` and `progressions` tabs:
  `disabled={activeTab !== "lyrics" && activeTab !== "progressions"}`.
- No changes to `setAllSectionsCollapsed` logic or to the in-tab collapse button inside `ProgressionsTab.tsx`.

## Files

- Edit `src/components/chord/FloatingChordToolbar.tsx`
- Edit `src/components/song/SongTitleHeader.tsx`

## Out of scope

- No changes to inline rename pencils, spice sheet, voice-leading components, or any store logic.
