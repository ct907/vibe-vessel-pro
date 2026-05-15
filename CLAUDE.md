# vibe-vessel-pro — Claude Instructions

## Branch
Always develop on branch `claude/enhance-chord-interface-DqKIg`. Create it locally if it doesn't exist.

## Workflow
- Commit and push after completing each task without asking for confirmation.
- Always push to the branch above using `git push -u origin <branch>`.
- Run `npx tsc --noEmit` before committing to catch type errors.

## Stack
- React + TypeScript + Vite
- Tailwind CSS with custom oklch design tokens (see `src/index.css`)
- Zustand stores (`src/store/`)
- shadcn/ui components (`src/components/ui/`)
- `@hello-pangea/dnd` for drag-and-drop

## Design system
- Font families: Zain (display), Nunito (UI), JetBrains Mono (chords — use `.font-mono-chord`)
- Amber accent: `--primary`, `--primary-strong`, `--primary-halo`
- Paper surfaces: `--paper`, `--paper-card`, `--paper-shade`
- Ink scale: `--ink`, `--ink-soft`
- Sculpted button recipes: `.btn-sculpt-amber`, `.btn-sculpt-cream`, `.btn-sculpt-cocoa`
- Shadows: `--shadow-card`, `--shadow-recess`, `--shadow-paper`, `--shadow-sculpt-*`

## Code style
- No comments unless the WHY is non-obvious.
- No unnecessary abstractions — prefer inline over premature helpers.
- Prefer editing existing files over creating new ones.
- Do not add error handling for scenarios that can't happen.
