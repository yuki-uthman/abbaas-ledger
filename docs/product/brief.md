# Product brief

## Request
    Put each entry's method on its Home card's third line in the Abbaas Ledger at /Users/Yuki/Claude/abbaas-ledger, where recording the method is integrated at edf9bd1, following the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa as revised on 2026-10-16: the currency detail line (Paid in USD, or MVR 10,000 at 20.00) is removed from Home's cards and the method's icon and word take its place, so the amount line holds only the amount and the method tag can never overflow the card; the MVR amount and rate stay in the entry's sheet.

## Outcomes
-     The method tag never spills over a card, at any amount and any phone width from 360 px.
-     A card stays three short lines: how much, to or from whom, and how it moved.
-     The MVR amount and rate are still one tap away, in the entry's sheet.

## Scope

### In scope
-     Home's entry card: the amount alone on the first line, the person or from Abbaas on the second, the method's icon and word on the third.
-     No third line for an entry without a method.
-     The tests that read the old detail line or the tag on the amount line, rewritten.

### Out of scope
Applicability: applicable
Reason:     Only where the method is drawn on a Home card changes; the forms, storage, the sheet and the motion stay as integrated.
-     Any change to the Send or Receive forms or the Method row.
-     Any change to the entry sheet's lines.
-     Any change to the schema or the cloud project.
-     Dark theme.

## Observations
-     On Home a card whose entry has a stored method shows, as its third line under the person, the method's icon and Cash, Cheque or Transfer in place of the currency detail, and its first line holds the amount alone; a card whose entry has no method has no third line; the entry's sheet still names the method above Date.
-     Home at rest still reads as the travelling-cards board, with sends right and payments left of the centre line, the dot, the after lines and the totals, and no card shows a currency detail such as Paid in USD or MVR 10,000 at 20.00 any more: a card reads its amount, then its person or from Abbaas, then its method when it has one.
-     Saving an MVR send still stores the MVR amount, the rate and the USD value; once Home rests its card reads $500.00, the person and Transfer, with no MVR figure, wholly right of the centre line, and its sheet reads MVR 10,000 and the rate 20.00.

## Decisions
-     The visual reference is the Home artboard of https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa as revised on 2026-10-16.
-     The card's third line is the method: an 12 px stroke icon in the card's colour (#24508a for a send, #0f6f68 for a payment) and the word Cash, Cheque or Transfer in 12 px weight 600 muted #4c5f5b, aligned to the card's outer edge like the other two lines. It carries data-entry-method with the stored word, and its text is exactly the word.
-     The currency detail (Paid in USD, or MVR <amount> at <rate>) is no longer drawn on Home; the sheet keeps data-sheet-mvr and data-sheet-rate as integrated.
-     The amount line holds only the amount; the pill on the amount line is removed.
-     An entry whose method is null shows only the amount and the person lines.

## Values
| Observation | Dependencies |
| --- | --- |
| On Home a card whose entry has a stored method shows, as its third line under the person, the method's icon and Cash, Cheque or Transfer in place of the currency detail, and its first line holds the amount alone; a card whose entry has no method has no third line; the entry's sheet still names the method above Date. |  |
| Home at rest still reads as the travelling-cards board, with sends right and payments left of the centre line, the dot, the after lines and the totals, and no card shows a currency detail such as Paid in USD or MVR 10,000 at 20.00 any more: a card reads its amount, then its person or from Abbaas, then its method when it has one. | On Home a card whose entry has a stored method shows, as its third line under the person, the method's icon and Cash, Cheque or Transfer in place of the currency detail, and its first line holds the amount alone; a card whose entry has no method has no third line; the entry's sheet still names the method above Date. |
| Saving an MVR send still stores the MVR amount, the rate and the USD value; once Home rests its card reads $500.00, the person and Transfer, with no MVR figure, wholly right of the centre line, and its sheet reads MVR 10,000 and the rate 20.00. | On Home a card whose entry has a stored method shows, as its third line under the person, the method's icon and Cash, Cheque or Transfer in place of the currency detail, and its first line holds the amount alone; a card whose entry has no method has no third line; the entry's sheet still names the method above Date. |
