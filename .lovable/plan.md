## Plan

Refactor the Progressions tab to use the same failsafe slot-grid approach as the Lyrics chord row, instead of the current beat-flex draggable list.

### What will change

1. **Pattern blocks become slot grids**
   - Each pattern block will render a fixed number of equal drop slots:
     - `slotCount = bars * 2`
     - Example: 4 bars = 8 slots, 8 bars = 16 slots.
   - Chords will always be packed left-to-right into those slots.
   - Empty slots remain visible as add/drop targets.

2. **Bars changes repack chord positions**
   - When the user changes the number of bars, the pattern block recalculates `slotCount`.
   - Existing chords keep their current order and are repacked from slot 0 onward.
   - If bars are reduced and there are more chords than slots, overflow chords will move into following pattern blocks in the same section where possible, matching the app’s existing overflow behavior.

3. **Drag and drop becomes slot-based**
   - Replace the current pattern DnD implementation, where Draggables are the flex chord chips, with the lyrics-style stable slot list.
   - Each slot is a stable Droppable index, and a chord chip lives inside the slot.
   - Dragging a chord to slot N means “move/reorder this chord to slot N.”
   - Basket chords can be dropped into a specific slot in a pattern block.

4. **Arrow sort becomes slot/order-based**
   - Left/right context-menu buttons will no longer shift by beat math.
   - Single chord:
     - Left swaps with the previous occupied slot/order position.
     - Right swaps with the next occupied slot/order position.
   - Multiple selected chords:
     - Left/right moves the selected group earlier/later as a group, preserving internal order.

5. **Context menu behavior stays familiar**
   - Keep existing progression context menu rows and “Move To” dropdown.
   - The move buttons will call the new slot/order actions so they work consistently.
   - Length controls can remain for now if desired, but visual slot placement will be based on order rather than beat-proportional width. I will keep length metadata intact unless you ask to remove it.

### Technical details

- Add small store helpers in `src/store/song.ts`:
  - `getPatternSlotCount(pattern) = pattern.bars * 2`
  - `repackPatternSlots(pattern)` maps ordered chords to `startBeat = slotIndex * 2` and a display-safe length.
  - `movePatternChordToSlot(patternId, chordId, slotIndex)`
  - `movePatternChordsToSlot(patternId, chordIds, slotIndex)` for multi-drag/group moves.
  - `addChordToPatternSlot(patternId, chord, slotIndex)` for picker/basket placement.
- Update existing pattern actions (`updatePattern`, `reorderPatternChord`, `movePatternChord`, `shiftPatternChords`, `movePatternChordsTo`) to preserve this left-packed slot order.
- Rewrite the pattern grid in `src/components/progressions/ProgressionsTab.tsx`:
  - Render `slotCount` equal-width slot wrappers.
  - Put each ordered chord into one slot.
  - Use `@hello-pangea/dnd` against stable slot indices, mirroring the lyrics row strategy.
  - Remove or neutralize the pointer/long-press handlers that currently compete with pangea drag start.
- Keep basket drag support:
  - `basket:ID` drops into `pattern:ID` at `destination.index`.
- Keep visual bar guides:
  - Since each bar equals two slots, draw stronger vertical separators every 2 slots.
  - Optional faint separators between half-bar slots.

### Expected result

- Tap/click-and-hold drag in Progressions should behave like the Lyrics chord row.
- Releasing a chord into a slot reliably reorders it.
- Left/right buttons reliably sort one or multiple selected chords.
- Changing bars changes the number of available slots and repacks chords left-to-right automatically.