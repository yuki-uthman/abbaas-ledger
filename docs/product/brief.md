# Product brief

## Request
    Let the owner record how money moved in the Abbaas Ledger at /Users/Yuki/Claude/abbaas-ledger, where the one-tap delete is integrated at 112e554, following the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa: the Send and Receive forms each offer a Method choice of Cash, Cheque or Transfer, Send opening on Transfer and Receive on Cheque; the chosen method is stored with the entry; Home shows each entry's method as a small tag on its card and the entry sheet shows a Method line.

## Outcomes
-     Each entry says whether the money moved as cash, a cheque or a bank transfer, so the owner can match it to a bank statement or a cheque book later.
-     Recording the usual case costs no extra tap: a send is a transfer and a payment from Abbaas is a cheque unless the owner picks otherwise.
-     The method can be read at a glance on Home and in full on the entry's sheet.

## Scope

### In scope
-     A nullable method column on entries, limited to cash, cheque or transfer, added by a new migration.
-     The Send form's Method row of Cash, Cheque and Transfer under the amount block and above Paid to, Transfer chosen when the form opens, in USD and in MVR.
-     The Receive form's Method row under the amount and above the date, Cheque chosen when the form opens.
-     Storing the chosen method with every new send and payment.
-     A small method tag with its icon on each Home entry card that has a method, and a Method line above Date in the entry sheet.

### Out of scope
Applicability: applicable
Reason:     Only the method is added; amounts, rates, people, dates, the travelling cards and deleting stay as integrated.
-     Editing the method of an entry already saved.
-     Filtering or totalling entries by method.
-     Cheque numbers, bank names or any other detail of a method.
-     Remembering the last method used.
-     Pushing the migration to the cloud project; the owner does that after integration.
-     Dark theme.

## Observations
-     Opening the blue Send form shows a Method row of Cash, Cheque and Transfer under the amount and above Paid to with Transfer chosen; saving a send stores transfer, or the method tapped instead, with the entry, in USD and in MVR.
-     Opening the teal Receive form shows the same Method row under the amount and above the date with Cheque chosen; saving a payment from Abbaas stores cheque, or the method tapped instead, with the entry.
-     On Home every entry card whose entry has a stored method shows a small tag with its icon and Cash, Cheque or Transfer on the amount line nearest the centre line, and tapping the card opens a sheet with a Method line above Date naming it; an entry stored without a method shows no tag and no Method line.

## Decisions
-     The visual reference is the design board https://claude.ai/artifact/729zVXtrBTxsNAvjVzAfZa as approved by the owner on 2026-10-16; everything it does not change stays as integrated.
-     The stored values are the lower-case words cash, cheque and transfer in a new nullable entries.method column with a check constraint; entries saved before this change keep a null method.
-     The Method row is a three-option segmented control in the same shape as the USD/MVR switch: a 52 px rounded track of white at 12 % opacity, the chosen option a white pill in the form's deep colour (#1b3f6e on Send, #0b5750 on Receive), each option a stroke icon and its word, labelled Method above it. It is a radio group: role=radiogroup labelled Method, each option role=radio with aria-checked.
-     Send opens with Transfer chosen and Receive opens with Cheque chosen; tapping another option chooses it; there is always exactly one chosen, so Save never waits for a method.
-     On a Home card the method is a small pill on the amount line: its icon and Cash, Cheque or Transfer in the card's colour on white at about 78 % opacity, on the side nearest the centre line, while the amount stays on the outer edge. A card whose entry has no method shows no pill.
-     The entry sheet shows a Method line, the label Method on the left and the icon and word on the right, directly above the Date line; an entry without a method has no Method line.
-     The attribute contract stays, and this change adds data-method on the Method radio group's options (data-method=cash|cheque|transfer), data-entry-method on a Home card's tag holding the stored word, and data-sheet-method on the sheet's Method line.

## Values
| Observation | Dependencies |
| --- | --- |
| Opening the blue Send form shows a Method row of Cash, Cheque and Transfer under the amount and above Paid to with Transfer chosen; saving a send stores transfer, or the method tapped instead, with the entry, in USD and in MVR. |  |
| Opening the teal Receive form shows the same Method row under the amount and above the date with Cheque chosen; saving a payment from Abbaas stores cheque, or the method tapped instead, with the entry. | Opening the blue Send form shows a Method row of Cash, Cheque and Transfer under the amount and above Paid to with Transfer chosen; saving a send stores transfer, or the method tapped instead, with the entry, in USD and in MVR. |
| On Home every entry card whose entry has a stored method shows a small tag with its icon and Cash, Cheque or Transfer on the amount line nearest the centre line, and tapping the card opens a sheet with a Method line above Date naming it; an entry stored without a method shows no tag and no Method line. | Opening the blue Send form shows a Method row of Cash, Cheque and Transfer under the amount and above Paid to with Transfer chosen; saving a send stores transfer, or the method tapped instead, with the entry, in USD and in MVR. |
