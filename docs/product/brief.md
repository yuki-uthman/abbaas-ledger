# Product brief

## Request
    Build the travelling cards from the design board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW into the Abbaas Ledger at /Users/Yuki/Claude/abbaas-ledger, where deleting an entry is integrated at 52ffbc4: every entry card rests on the side of whoever received the money, sends on Abbaas's side and payments on the owner's side; the centre line shows a small dot in the card's colour instead of an arrow; who holds what after an entry is written on the side the card came from; the totals read You received on the left and Abbaas received on the right; and a new or opening card is born on the sender's side and travels across the centre line to rest on the receiver's side.

## Outcomes
-     The list shows at a glance where each amount went: a card sits on the side of whoever received the money, under that person's box.
-     Saving an entry is felt as money moving: the card leaves the sender's side and lands on the receiver's, so no arrow has to be read.
-     Totals name who received the money, so each total sits above the cards it adds up.

## Scope

### In scope
-     Home's resting layout: sends right of the centre line, payments left, a dot on the line, the after line on the side the card came from, at every width from 360 px.
-     The totals row: You received (left, the payments total) and Abbaas received (right, the sends total).
-     The save motion: the new card appears on the sender's side, holds, crosses and rests; the boxes count during the crossing; an overpayment swaps the boxes.
-     Home's opening entrance: every card crosses from its sender's side, staggered.
-     Reduced motion: every card shown at rest at once.

### Out of scope
Applicability: applicable
Reason:     Only where the cards rest, how they move and the totals wording change; the forms, storage, sign-in and the entry sheet stay as integrated.
-     Any change to the Send or Receive forms, their fields or their buttons.
-     Any change to the entry sheet or deleting an entry.
-     Any change to the schema, the policies or the Supabase project.
-     Dark theme.
-     A Saved message, Undo, or a toast after a save.

## Observations
-     Saving a USD send from the blue form, to a saved person or to a new one, stores it and, once Home rests, shows its card wholly right of the centre line on Abbaas's side, the side of whoever received the money.
-     Saving a payment from Abbaas from the teal form stores it and, once Home rests, shows its card wholly left of the centre line on the owner's side; a payment larger than Abbaas holds still empties his box and fills the owner's with the difference.
-     Saving an MVR send stores the MVR amount, the rate and the USD value, and once Home rests its card, reading MVR 10,000 at 20.00 under its $500.00, lies wholly right of the centre line.
-     After a save there is still no Saved message and no Undo: the new card, at rest on the side of whoever received the money with the ring in its colour, is the whole feedback, and the stored entry stays stored.
-     Home at rest reads as the travelling-cards board: sends right of the centre line and payments left of it at every width from 360 px, each row with a small round dot in its card's colour on the line and no arrow, who holds what after it on the side the card came from, and under the boxes the totals You received $… on the left and Abbaas received $… on the right.
-     After a save, once Home has grown from the form's button, the new card appears on the sender's side (a send on the owner's left, a payment on Abbaas's right) lifted and wearing its ring, holds there a moment, then crosses the centre line and rests on the receiver's side while the boxes count to the new balance; a payment larger than Abbaas holds drains his box as the owner's fills; with reduced motion the card is shown at rest at once.
-     Opening the app plays Home's entrance with every entry card crossing from its sender's side over the centre line to its resting side, one after another, after the boxes rise and the line draws down; with reduced motion every screen shows its end state at once.

## Decisions
-     The visual reference is the travelling-cards board https://claude.ai/artifact/JLyxbr7tdERmhwuMAimajW as built on 2026-10-14; everything it does not change stays as on the refined final canvas https://claude.ai/artifact/XpzsEF5ovaU7cB3wYp5bEi.
-     A card rests on the side of whoever RECEIVED the money: a send on the right, under Abbaas's box; a payment from Abbaas on the left, under the owner's box. Its text aligns to the outer edge of that side.
-     The centre line carries, for each row, a 10 px round dot in the card's colour (blue #24508a for a send, teal #0f6f68 for a payment) with a 4 px page-coloured halo, instead of the round arrow node.
-     Who holds what after an entry (data-after, e.g. 'Abbaas has $740.00') sits on the opposite half from the card, which is the side the card came from, and hugs the centre line.
-     The totals row reads 'You received $1,500.00' on the left (data-total=paid, the payments total, its figure in teal #0f6f68) and 'Abbaas received $2,240.00' on the right (data-total=sent, the sends total, its figure in blue #24508a). The data-total attribute names stay as they are.
-     The save motion, on the one curve cubic-bezier(0.2, 0.8, 0.2, 1): after Home has grown from the button (unchanged), the new card's day group opens; at +120 ms the card fades in over 240 ms on the SENDER's half, scaling 0.92 to 1, lifted with a soft shadow and wearing its 2 px ring; it holds there 500 ms; then it crosses the centre line over 760 ms to rest on the receiver's half, the boxes counting to the new balance over 800 ms from the start of the crossing; on landing the shadow settles, the ring stays, and the dot and the after line fade in.
-     During the appear and the hold the card's layout box, as the browser measures it, lies wholly on the sender's half (a transform of one card width plus the dot column moves it there); it carries data-motion='cross' from before its first displaced frame until it rests, and no data-motion remains once everything rests.
-     Home's first open keeps its entrance (boxes rise, balance counts up from $0, centre line draws down) but every card enters by crossing from its sender's side to its resting side over 680 ms, 90 ms apart, each carrying data-motion while it moves.
-     With reduced motion every card is shown at rest at once and nothing carries data-motion.
-     The attribute contract stays: data-box, data-state, data-amount, data-square, data-total, data-count, data-day, data-entry, data-person, data-after, data-after-holder, data-action, data-form, data-person-chip, data-prefix, data-usd, data-motion, data-spine and the entry sheet's attributes.

## Values
| Observation | Dependencies |
| --- | --- |
| Saving a USD send from the blue form, to a saved person or to a new one, stores it and, once Home rests, shows its card wholly right of the centre line on Abbaas's side, the side of whoever received the money. |  |
| Saving a payment from Abbaas from the teal form stores it and, once Home rests, shows its card wholly left of the centre line on the owner's side; a payment larger than Abbaas holds still empties his box and fills the owner's with the difference. |  |
| Saving an MVR send stores the MVR amount, the rate and the USD value, and once Home rests its card, reading MVR 10,000 at 20.00 under its $500.00, lies wholly right of the centre line. |  |
| After a save there is still no Saved message and no Undo: the new card, at rest on the side of whoever received the money with the ring in its colour, is the whole feedback, and the stored entry stays stored. |  |
| Home at rest reads as the travelling-cards board: sends right of the centre line and payments left of it at every width from 360 px, each row with a small round dot in its card's colour on the line and no arrow, who holds what after it on the side the card came from, and under the boxes the totals You received $… on the left and Abbaas received $… on the right. |  |
| After a save, once Home has grown from the form's button, the new card appears on the sender's side (a send on the owner's left, a payment on Abbaas's right) lifted and wearing its ring, holds there a moment, then crosses the centre line and rests on the receiver's side while the boxes count to the new balance; a payment larger than Abbaas holds drains his box as the owner's fills; with reduced motion the card is shown at rest at once. |  |
| Opening the app plays Home's entrance with every entry card crossing from its sender's side over the centre line to its resting side, one after another, after the boxes rise and the line draws down; with reduced motion every screen shows its end state at once. |  |
