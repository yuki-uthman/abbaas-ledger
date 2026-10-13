# Product brief

## Request
    Let the owner delete a wrong entry in the Abbaas Ledger at /Users/Yuki/Claude/abbaas-ledger, where the refined board is integrated at db986eb: tapping an entry card on Home opens a sheet with that entry's details and a red Delete button, Delete asks Delete this entry? with Cancel and Delete, and confirming removes the entry for good so the list, the count, the totals and the balance no longer include it. There is still no Undo.

## Outcomes
-     A wrong entry can be removed from a phone in a few taps, so the balance can be put right without touching the database.
-     Nothing is deleted by one stray tap: the owner sees which entry it is and confirms before it goes.
-     After a delete the balance, the totals and the count are the sums of the entries that remain, on Home at once and after a reload.

## Scope

### In scope
-     Tapping an entry card on Home opens an entry sheet over a dimmed Home, in the app's light theme: the entry's kind, its USD amount, in MVR the rufiyaa amount and the rate, the person for a send, and the date, with a red Delete button and a Close button.
-     Closing the sheet with Close, a tap on the dimmed Home or Android's back button.
-     A confirmation step inside the sheet, Delete this entry? with Cancel and Delete.
-     Removing the entry through the existing LedgerStore.removeEntry under row-level security, then showing Home without it.
-     A spoken Retry message when the server cannot be reached, with the entry kept.

### Out of scope
Applicability: applicable
Reason:     This change only lets a wrong entry be removed; everything else about entries stays as integrated.
-     Editing an entry's amount, rate, person or date.
-     Undo after a delete, or a recycle bin of deleted entries.
-     Deleting several entries at once.
-     Deleting or renaming saved people.
-     Swipe or long-press gestures on entry cards.
-     Dark theme.
-     Any change to the schema, the policies or the Supabase project.

## Observations
-     Tapping an entry card on Home opens a sheet that rises over the dimmed Home and shows that entry as recorded: Sent for Abbaas or Paid back by Abbaas, its dollar amount, in MVR the rufiyaa amount and the rate, for a send who it was paid to, and its date, with a red Delete button and a Close button; Close, a tap on the dimmed Home or the phone's back button closes the sheet and the entry, the count and the balance stay as they were.
-     Tapping Delete in the sheet asks Delete this entry? with Cancel and Delete; Cancel keeps the entry; confirming removes it from storage, so Home at once and after a reload no longer lists it, the Entries count drops by one, and the totals and the balance are worked out without it; if the server cannot be reached the sheet stays open with Could not delete. Try again. and the entry stays.

## Decisions
-     The refined board draws no delete, so the sheet follows the app's own look: the page colour, Manrope for figures and titles, Source Sans 3 for text, a white sheet with rounded top corners rising from the bottom over Home dimmed with the ink colour, and the entry's own blue or teal as its accent.
-     The sheet is opened only by a tap on an entry card. Swipes and long presses do nothing, so scrolling the list can never delete.
-     Delete always asks first. The confirmation is part of the sheet, not a browser dialog: the words Delete this entry? with Cancel and a red Delete.
-     A delete is final. There is no Undo and no hidden copy; the row is removed through LedgerStore.removeEntry and row-level security decides that only the owner's own row can go.
-     After a delete Home is shown from a fresh read of the stored entries, so the count, the totals and the balance are always the sums of what is stored.
-     When the server cannot be reached the delete is a Retry: the sheet stays open saying Could not delete. Try again. and the entry stays in the list.
-     The sheet opens and closes on the app's one curve and honours reduced motion; while it moves it carries data-motion, as every other motion does, and none remains once it rests.
-     Opening the sheet adds a history entry, so Android's back button closes the sheet before it leaves Home.

## Values
| Observation | Dependencies |
| --- | --- |
| Tapping an entry card on Home opens a sheet that rises over the dimmed Home and shows that entry as recorded: Sent for Abbaas or Paid back by Abbaas, its dollar amount, in MVR the rufiyaa amount and the rate, for a send who it was paid to, and its date, with a red Delete button and a Close button; Close, a tap on the dimmed Home or the phone's back button closes the sheet and the entry, the count and the balance stay as they were. |  |
| Tapping Delete in the sheet asks Delete this entry? with Cancel and Delete; Cancel keeps the entry; confirming removes it from storage, so Home at once and after a reload no longer lists it, the Entries count drops by one, and the totals and the balance are worked out without it; if the server cannot be reached the sheet stays open with Could not delete. Try again. and the entry stays. | Tapping an entry card on Home opens a sheet that rises over the dimmed Home and shows that entry as recorded: Sent for Abbaas or Paid back by Abbaas, its dollar amount, in MVR the rufiyaa amount and the rate, for a send who it was paid to, and its date, with a red Delete button and a Close button; Close, a tap on the dimmed Home or the phone's back button closes the sheet and the entry, the count and the balance stay as they were. |
