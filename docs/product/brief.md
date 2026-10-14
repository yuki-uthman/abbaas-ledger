# Product brief

## Request
    Remove the delete confirmation from the entry sheet of the Abbaas Ledger at /Users/Yuki/Claude/abbaas-ledger, where the travelling cards are integrated at 8f40bca: tapping the red Delete in an entry's sheet removes that entry at once, without asking Delete this entry? and without a Cancel, so the list, the count, the totals and the balance no longer include it; there is still no Undo.

## Outcomes
-     A wrong entry is removed with one tap on Delete once its sheet is open, with no second question to answer.
-     After a delete the balance, the totals and the count are the sums of the entries that remain, on Home at once and after a reload.
-     A delete that cannot reach the server still keeps the entry and says so.

## Scope

### In scope
-     The entry sheet's foot: Close on the left and the red Delete on the right, side by side; tapping Delete starts the removal at once.
-     While the removal is out, Delete and Close are both disabled, so a second tap removes nothing more.
-     The removal itself through the existing LedgerStore.removeEntry and the fresh read of Home after it, unchanged.
-     The Retry when the server cannot be reached: the sheet stays open with Could not delete. Try again. above Close and Delete, and the entry stays.

### Out of scope
Applicability: applicable
Reason:     Only the confirmation step is removed; opening the sheet, what it shows and how a removal lands stay as integrated.
-     Undo after a delete, a toast, or a recycle bin of deleted entries.
-     Any change to opening or closing the sheet, or to the details it shows.
-     Any change to Home's layout, the travelling cards or their motion.
-     Any change to the schema, the policies or the Supabase project.
-     Dark theme.

## Observations
-     Tapping the red Delete in an entry's sheet removes that entry at once, without asking Delete this entry? and without offering Cancel: the sheet closes, Home at once and after a reload no longer lists it, the Entries count drops by one, and the totals and the balance are worked out without it, while the other entries stay stored; if the server cannot be reached the sheet stays open with Could not delete. Try again. above Close and Delete, and the entry stays listed and stored.

## Decisions
-     The owner asked on 2026-10-14 to remove the confirmation: a tap on the card already opens the sheet that names the entry, and the sheet's Delete is the deliberate second tap.
-     The words Delete this entry? and This cannot be undone. and the Cancel button no longer exist anywhere in the sheet.
-     The foot keeps the side-by-side shape the owner chose: Close on the left, the red Delete on the right, in every state.
-     One tap on Delete calls LedgerStore.removeEntry exactly once; while it is out both buttons are disabled and a tap on the dimmed Home or Escape is ignored, as before.
-     A delete is final. There is no Undo and no hidden copy, and Home is repainted from a fresh read of the stored entries.
-     When the server cannot be reached the sheet stays open saying Could not delete. Try again. with Close and Delete enabled again, and the entry stays listed and stored.
-     The sheet's attribute contract stays: data-entry-sheet, data-sheet-scrim, data-sheet-usd, data-sheet-mvr, data-sheet-rate, data-sheet-person, data-sheet-date, data-sheet-delete, data-sheet-close and data-sheet-actions.

## Values
| Observation | Dependencies |
| --- | --- |
| Tapping the red Delete in an entry's sheet removes that entry at once, without asking Delete this entry? and without offering Cancel: the sheet closes, Home at once and after a reload no longer lists it, the Entries count drops by one, and the totals and the balance are worked out without it, while the other entries stay stored; if the server cannot be reached the sheet stays open with Could not delete. Try again. above Close and Delete, and the entry stays listed and stored. |  |
