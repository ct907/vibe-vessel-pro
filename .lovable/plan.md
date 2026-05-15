# In-App User Manual ("Help" Page)

A beginner-focused Help page built into the app, accessible from the header, with captured screenshots and concise step-by-step instructions.

## Structure

A new route `/help` rendered as a single scrollable page with a sticky left-side table of contents (collapses to a top dropdown on mobile). Reuses existing design tokens (`paper-card`, `ink`, `font-display`, `font-mono-chord`) so it feels native to the app.

### Entry points
- Add a "Help" item to the menu in `TransportHeader` (existing `Menu` icon dropdown) → links to `/help`.
- Also link from the Landing page footer.

## Sections

Each section: short intro → numbered steps → screenshot with callout → "Tip" callout where helpful.

1. **Welcome & Overview of the Three Tabs**
   - What Lyrics, Chords, and Progressions tabs are for, and how they work together (chords picked in the Chord tab flow into the basket; the basket feeds Lyrics and Progressions).

2. **Adding a Chord in the Lyrics Tab**
   - Tap a word → ChordPickerSheet (mobile) / FocusedChordEditor opens → pick root, quality, octave → Close to save.
   - Mention drag-from-basket alternative.

3. **Writing Lyrics & Creating New Lines**
   - Type into the lyric line field; press Enter/Return to create a new line below; Backspace on empty line removes it.

4. **Browsing Chords & the Basket Bar**
   - Filter by Nashville numeral; tap to audition; checkbox to multi-select; "Add to basket".
   - The Basket Bar (bottom): drag chips into Lyrics or Progressions, or use "Send to" buttons.

5. **Adding a Chord in the Progressions Tab**
   - Tap an empty slot in a pattern block → picker opens → pick chord and octave → Close.
   - Drag from basket as alternative.

6. **How Pattern Blocks Work**
   - A pattern block = a repeating chord progression with N bars. Add multiple blocks per section. Patterns drive playback and bar count.

7. **Adjusting the Bar Length of a Chord**
   - Each chord chip in a pattern shows a duration handle; drag to extend/shorten across bars.

8. **Adjusting Pattern Block Length**
   - Use the bar-count control on the pattern header (+/− or stepper) to change total bars.

9. **Adjusting Sounds**
   - Open Sound Panel from TransportHeader → choose preset (Rhodes, DX Keys, Juno, …) → tweak Timbre, ADSR, EQ, FX. Volume in header.

10. **Saving Your Progress**
    - Autosave is on by default (saves to your browser).
    - "Save" button in the header menu → downloads a `.json` project file.
    - "Open" lets you reload a `.json` file.

### Brief one-liner mentions (per user request)
- Exporting lyrics (ExportLyricsSheet)
- Changing key/mode (header dropdown)
- Sort/reorder mode for sections
- Sound presets quick reference

## Technical Details

**New files**
- `src/pages/Help.tsx` — main page
- `src/components/help/HelpSection.tsx` — section wrapper (heading + body + screenshot slot)
- `src/components/help/HelpToc.tsx` — sticky TOC / mobile dropdown
- `src/assets/help/*.png` — screenshots (captured from live preview at `/index`)

**Modified files**
- `src/App.tsx` — register `/help` route
- `src/components/header/TransportHeader.tsx` — add "Help" link in menu
- `src/pages/Landing.tsx` — add Help link in footer (small)

**Screenshot pipeline** (during build only, not runtime):
- Use browser tool to navigate the preview at relevant states (lyrics tab with a picker open, chords tab with basket, progressions tab with a pattern block, sound panel open).
- Save to `src/assets/help/` and import as ES6 modules.
- Add red-circle/arrow callouts via simple absolute-positioned overlay divs in `HelpSection` (no image editing needed).

**Styling**
- Page uses `bg-paper`, `font-display` for h1/h2, `font-nunito` for body.
- Screenshots in rounded `paper-card` containers with `shadow-card`.
- Numbered steps as `<ol>` with custom marker styling matching the app's amber accent.

**Accessibility/SEO**
- Single H1 ("Help & User Manual"), H2 per section, anchor IDs for TOC links.
- `<title>` and `<meta description>` set via `<Helmet>` if available, else direct `document.title` effect.
- Alt text on every screenshot describing what it shows.

## Out of scope
- No video tutorials.
- No backend storage of help-read state.
- No i18n (English only for v1).

## Open question
Confirm the menu placement for the Help link — top of the header dropdown, or under a new "?" icon button next to the menu? I'll default to the dropdown unless you prefer the icon.
