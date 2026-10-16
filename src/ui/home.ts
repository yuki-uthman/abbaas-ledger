// Home as a function from the read ledger to DOM: the account's entries, newest
// first, under the balance card.
//
// Value 5 adds repayments to what Home reads, and needs no new shape to do it,
// because the projection and the attribute contract below already answer for
// them: balanceOf subtracts a receive, so the owner's box fills (unsigned, with
// the caption 'have his money') and Abbaas's empties when a payment is larger
// than he held, and the All square chip appears exactly at zero; a receive
// renders beside a teal node, reads 'from Abbaas' and carries no data-person.
// (Which side it is drawn on is settled by the refined board, noted below, and
// the node is a plain dot: travelling cards took the arrow off it.)
//
// The attribute contract this value fixes, and every later value keeps:
//   - each entry element carries data-entry="<entries.id>"
//   - the element naming its person carries data-person="<people.id>"
//   - a repayment from Abbaas carries data-entry and no data-person
// Later values may restyle and move these elements, but must keep the attributes.
//
// This value adds the balance card above the list. Its own attribute contract,
// which every later value keeps:
//   - the owner's box carries data-box="you", Abbaas's carries data-box="abbaas"
//   - each box carries data-state="filled"|"empty" and data-amount="<cents>"
//     (0 when empty); only the holder's box is filled
//   - the All square chip carries data-square and is present exactly when the
//     balance is zero
//   - the empty-ledger hint carries data-empty-hint
//   - the bottom buttons carry data-action="send" and data-action="receive"
//
// Value 6 groups the list by day and shows what each entry leaves behind it,
// adding to the same contract, which every later value keeps:
//   - each day group carries data-day="YYYY-MM-DD" and reads its own label
//   - each entry carries data-after="<signed cents>" and shows, on the other
//     side of the centre line, who holds what after it
//   - the totals carry data-total="sent" and data-total="paid", and their
//     difference is the balance the boxes show
// What the list is made of is decided by ledger-view.ts, which is pure; this
// file only draws what it returns.
//
// The refined board reshapes this screen and takes nothing from the contract
// above, except that it settles which side each kind is drawn on. Travelling
// cards then fixes that rule as the resting side of whoever RECEIVED the money:
// a send's card lies wholly RIGHT of the centre line, on Abbaas's side, and a
// payment from Abbaas wholly left of it, on the owner's; data-side names that
// resting side and data-after answers it from the half the money came from. Home carries no title, the
// two boxes are the top of the screen, and what this value adds to the contract
// is:
//   - the Entries count carries data-count and reads 'No entries', '1 entry' or
//     'N entries'
//   - a filled box's cents are carried by data-cents inside the amount
//   - the fade over the foot of the list carries data-fade
//   - data-entry moved onto the entry's own tinted card, and data-after onto
//     the text that says who holds what after it
//
// Value 9 adds the motion of a save to this same screen and takes nothing away
// from it: Home is still painted in its end state, and the motion only travels
// to what is already written. With reduced motion asked for, none of it runs.
//
// Refined board value 7 adds the entrance Home plays when the app opens, which
// takes nothing away either and adds one element to the contract:
//   - the centre line of the list carries data-spine
// The line was a pseudo-element until now; it is an element of its own because
// the entrance draws it down, and a pseudo-element cannot be named or measured.
// Home is painted in its end state here as it always was, and the entrance only
// travels to it, so reduced motion reads the same screen from the first frame.
// Travelling cards makes the cards of that entrance cross the line rather than
// settle in from their own side: every card, not only a saved one, arrives from
// the half of whoever SENT the money and comes to rest on the receiver's.
//
// Refined board value 5 takes the save's words away and adds nothing: Home never
// builds a Saved message or an Undo, so data-saved-message leaves the contract
// and no element here carries it. What a save says is the new card alone - its
// 2 px ring in its own colour and its arrival from its own side - and the row it
// saved stays stored.
// Delete value 1 makes each entry card the way into that entry's sheet and
// takes nothing from the contract above: the card keeps data-entry, keeps its
// figures as its only accessible text and is NOT given role=button, so no
// existing lookup of a button changes meaning. What it gains is reach - a tab
// stop and aria-haspopup=dialog - while which hash a tap travels to stays the
// composition root's business. Home itself still writes nothing and reads
// nothing but the ledger it was handed, so a sheet opened over it cannot move
// its count, its boxes or its totals.
//
// Method value 3 adds one element to the contract above and takes nothing from
// it:
//   - a card whose entry has a stored method holds exactly one element carrying
//     data-entry-method="<the stored word>", reading 'Cash', 'Cheque' or
//     'Transfer'
//   - a card whose entry has no method holds no such element and utters none of
//     the three words
//
// Third line value 1 settles WHERE that element is read and what it replaces:
// the card is three lines, one under the other, each read from the card's own
// outer edge - the amount ALONE on the first, the party on the second, and the
// method on the third when there is one. It takes the currency detail line's
// place: 'Paid in USD' and 'MVR <amount> at <rate>' are no longer drawn on Home
// at all, because the sheet a tap on the card opens is where the rufiyaa figure
// and its rate are named. A card whose method is null is two lines and nothing
// more.
// The tag is read, never written: Home still writes nothing and reads nothing
// but the ledger it was handed.
import { balanceOf, boxFor, type Balance } from '../domain/balance.js'
import {
  deviceToday,
  entryCountLabel,
  groupEntriesByDay,
  splitAmount,
  type ListedEntry,
} from '../domain/ledger-view.js'
import { formatUsdCents } from '../domain/money.js'
import type { LedgerEntry, PaymentMethod, ReadEntriesOutcome } from '../ports/ledger-store.js'
import {
  CROSS_START_MS,
  SAVE_COUNT_MS,
  countBoxAmount,
  crossEntry,
  enterHome,
  openDayGroup,
  type Opening,
  type OpeningCount,
} from './motion.js'

export { formatUsdCents }

/* The currency detail line is gone from Home: no 'Paid in USD', no rufiyaa
   figure and no rate is built here, which is why nothing in this file reads
   entry.currency, entry.amountMinor or entry.rate any more. Those figures are
   named on the entry's sheet, which is the one place they are claimed now. */

/**
 * Method value 3, placed by third line value 1: the third line a card reads
 * when its entry has a stored method.
 *
 * It is part of the card's resting look and nothing else: it is drawn where the
 * card rests, carries no motion of its own, and the travelling-card motion moves
 * it with the card because it is inside the card. An entry stored WITHOUT a
 * method carries no line at all - a null method is nothing said, never a
 * default - so such a card is its amount and its party and nothing else.
 */
const METHOD_WORD: Record<PaymentMethod, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  transfer: 'Transfer',
}

/**
 * The same three line icons the forms offer the method by, drawn here at 12 px:
 * a note with a coin for cash, a slip with its signature rule for a cheque, and
 * two arrows passing each other for a transfer. Each is decoration beside the
 * word that already says the same thing, so it is hidden from the reading order.
 */
const METHOD_PATHS: Record<PaymentMethod, readonly string[]> = {
  cash: ['M3 7.5h18v9H3z', 'M12 10.5a1.5 1.5 0 0 0 0 3 1.5 1.5 0 0 0 0-3z'],
  cheque: ['M3 6.5h18v11H3z', 'M6.5 10h7', 'M6.5 14h4'],
  transfer: ['M4 9h13', 'M14 6l3 3-3 3', 'M20 15H7', 'M10 12l-3 3 3 3'],
}

const methodIcon = (method: PaymentMethod): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '12')
  svg.setAttribute('height', '12')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2.2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  for (const definition of METHOD_PATHS[method]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', definition)
    svg.append(path)
  }
  return svg
}

/**
 * The line itself: the stored word is what the owner reads, and the stored token
 * is what names the element, so the line's text is 'Cash' and never 'cash'. The
 * icon comes first and says the same thing, so it is the only thing before the
 * word and nothing else is in the line at all.
 */
const renderMethodLine = (method: PaymentMethod): HTMLElement => {
  const line = document.createElement('span')
  line.className = 'entry-method'
  line.dataset.entryMethod = method
  const word = document.createElement('span')
  word.textContent = METHOD_WORD[method]
  line.append(methodIcon(method), word)
  return line
}

const renderEntry = (listed: ListedEntry<LedgerEntry>): HTMLElement => {
  const entry = listed.entry
  // The row is three parts across the full width: the tinted card, the node
  // column holding the round node on the centre line, and the after-balance on
  // the opposite half. The row carries no contract attribute of its own; the
  // card is what data-entry names.
  const element = document.createElement('li')
  element.className = 'entry'
  // Travelling cards: a card rests on the side of whoever RECEIVED the money.
  // A send's card therefore lies wholly RIGHT of the centre line, on Abbaas's
  // side, and a payment from Abbaas lies wholly left of it, on the owner's.
  // data-side names that resting side, and nothing else: which column each part
  // of the row takes is drawn from it in theme.css.
  element.dataset.side = entry.kind === 'send' ? 'right' : 'left'
  // What the card IS stays its kind, because its colour, its arrow and its ring
  // belong to the money and not to the half it comes to rest in: a send is read
  // in the owner's blue wherever it lies.
  element.dataset.kind = entry.kind

  // The node on the line: a small round dot in the card's own colour, and
  // nothing else. Travelling cards takes the arrow away - which way the money
  // went is already said by the side the card rests on and by its colour - so
  // the dot carries no glyph and no text at all, and no row spells an arrow.
  const nodeCell = document.createElement('span')
  nodeCell.className = 'entry-node-cell'
  nodeCell.setAttribute('aria-hidden', 'true')
  const node = document.createElement('span')
  node.className = 'entry-node'
  nodeCell.append(node)

  const body = document.createElement('div')
  body.className = 'entry-card'
  // The card is the entry: data-entry is on the tinted box the owner reads.
  body.dataset.entry = entry.id
  // Delete value 1: the card opens this entry's sheet. It is deliberately NOT
  // given role=button - the card is the entry and reads as its own figures, and
  // naming it a button would change what every existing button lookup means -
  // so it is made reachable instead: a tab stop that says a dialog follows. The
  // listeners themselves belong to the composition root, which knows the hash a
  // sheet is opened by.
  body.tabIndex = 0
  body.setAttribute('aria-haspopup', 'dialog')

  const amount = document.createElement('span')
  amount.className = 'entry-amount'
  amount.textContent = formatUsdCents(entry.usdCents)

  const party = document.createElement('span')
  party.className = 'entry-party'
  if (entry.kind === 'send') {
    // A send reads 'to <name>', where the name alone is the thing that carries
    // the person's id: the word 'to' belongs to the line, not to the person.
    const name = entry.personName ?? ''
    if (name === '') {
      party.textContent = 'to'
    } else {
      party.append(document.createTextNode('to '))
      const named = document.createElement('span')
      if (entry.personId !== null) named.dataset.person = entry.personId
      named.textContent = name
      party.append(named)
    }
  } else {
    // A repayment names nobody, so it carries no data-person.
    party.textContent = 'from Abbaas'
  }

  // Who holds what after this entry, read across the line from the money that
  // caused it: teal when Abbaas holds, blue when the owner does, grey at square.
  const after = document.createElement('span')
  after.className = 'entry-after'
  after.dataset.afterHolder = listed.afterHolder
  // The standing this entry leaves behind it, signed: positive when Abbaas holds
  // the owner's money, negative when the owner holds his, 0 when square. It is
  // carried by the text that says so, across the line from the card.
  after.dataset.after = String(listed.afterCents)
  after.textContent = listed.afterText

  // The card's three lines, one under the other: the amount alone, the party,
  // and the method when one was stored - which takes the place the currency
  // detail used to hold. A card with no stored method appends nothing third, so
  // it is two lines and utters none of the three words.
  body.append(amount, party)
  if (entry.method !== null) body.append(renderMethodLine(entry.method))
  element.append(body, nodeCell, after)
  return element
}

const renderDayGroup = (group: {
  readonly date: string
  readonly label: string
  readonly entries: readonly ListedEntry<LedgerEntry>[]
}): HTMLElement => {
  const element = document.createElement('li')
  element.className = 'day-group'
  element.dataset.day = group.date

  const label = document.createElement('p')
  label.className = 'day-label'
  label.textContent = group.label

  const list = document.createElement('ul')
  list.className = 'day-entries'
  for (const listed of group.entries) list.append(renderEntry(listed))

  element.append(label, list)
  return element
}

type BoxLook = {
  readonly pill: string
  /** The caption an empty box carries: it claims nothing of the other's. */
  readonly emptyCaption: string
  /** The caption a filled box carries, from value 3 onward. */
  readonly filledCaption: string
}

const LOOK: Record<'you' | 'abbaas', BoxLook> = {
  you: { pill: 'You', emptyCaption: 'nothing of his', filledCaption: 'have his money' },
  abbaas: { pill: 'Abbaas', emptyCaption: 'nothing of yours', filledCaption: 'has your money' },
}

/**
 * Writes a figure of cents into a box's amount element, and the only place that
 * is done: the amount is never signed, so a box claiming nothing reads $0 and
 * one holding money reads $1,234.56, whose cents are carried in their own span
 * so they can be drawn at half the size while the figure still reads end to end.
 *
 * A counting box (value 9) is repainted by this same function on every frame,
 * which is what keeps the cents at half size while the count runs and after it
 * ends: the structure of a counting figure is the structure of a resting one.
 */
const paintBoxAmount = (amount: HTMLElement, cents: number): void => {
  if (cents === 0) {
    amount.textContent = '$0'
    return
  }
  const figure = splitAmount(formatUsdCents(cents))
  amount.textContent = figure.dollars
  const span = document.createElement('span')
  span.dataset.cents = ''
  span.textContent = figure.cents
  amount.append(span)
}

const renderBox = (balance: Balance, who: 'you' | 'abbaas'): HTMLElement => {
  const box = boxFor(balance, who)
  const look = LOOK[who]

  const element = document.createElement('div')
  element.className = 'box'
  element.dataset.box = who
  element.dataset.state = box.state
  // An empty box claims no money at all, so its amount is 0 and never the
  // balance the other side holds.
  element.dataset.amount = String(box.amountCents)

  const pill = document.createElement('span')
  pill.className = 'box-pill'
  pill.textContent = look.pill

  const amount = document.createElement('span')
  amount.className = 'box-amount'
  // The one place the box's figure is written, so a count can travel to it
  // without the rest of the box moving (value 9).
  amount.dataset.boxAmount = ''
  // An empty box claims nothing, so its figure is 0 and reads $0; the one
  // painter below is also what every frame of a count writes with.
  paintBoxAmount(amount, box.amountCents)

  const caption = document.createElement('span')
  caption.className = 'box-caption'
  caption.textContent = box.state === 'empty' ? look.emptyCaption : look.filledCaption

  // The amount and its caption sit together at the bottom of the box, on the
  // same outer edge the name pill is pinned to at the top.
  const foot = document.createElement('div')
  foot.className = 'box-foot'
  foot.append(amount, caption)

  element.append(pill, foot)
  return element
}

const renderBalanceCard = (balance: Balance): HTMLElement => {
  const card = document.createElement('div')
  card.className = 'balance-card'

  const boxes = document.createElement('div')
  boxes.className = 'boxes'
  // You is the left box and Abbaas the right one at every width.
  boxes.append(renderBox(balance, 'you'), renderBox(balance, 'abbaas'))
  card.append(boxes)

  if (balance.holder === 'none') {
    // The chip is present exactly when the balance is zero.
    const square = document.createElement('p')
    square.className = 'square-chip'
    square.dataset.square = ''
    square.textContent = 'All square · nobody owes anything'
    card.append(square)
  }

  const totals = document.createElement('p')
  totals.className = 'totals'
  // Each total reads as one sentence with its figure inked inside it, so the
  // element still reads 'Abbaas received $1,090.00' end to end. Travelling cards
  // names each total by who RECEIVED the money, the same rule the cards rest by:
  // what the owner paid out was received by Abbaas, and what came back was
  // received by the owner.
  const total = (which: 'sent' | 'paid', lead: string, cents: number): HTMLElement => {
    const element = document.createElement('span')
    element.dataset.total = which
    element.append(document.createTextNode(`${lead} `))
    const figure = document.createElement('span')
    figure.className = 'totals-figure'
    figure.textContent = formatUsdCents(cents)
    element.append(figure)
    return element
  }
  // What the owner received is on the left, under his own box, and what Abbaas
  // received on the right, under his: the same halves the cards rest in.
  totals.append(
    total('paid', 'You received', balance.paidBackCents),
    total('sent', 'Abbaas received', balance.sentCents),
  )
  card.append(totals)

  return card
}

/**
 * The Entries heading and, at the other end of its row, how many there are. The
 * heading is the first heading on Home: nothing is headed above the boxes.
 */
const renderEntriesHeader = (count: number): HTMLElement => {
  const header = document.createElement('div')
  header.className = 'entries-header'

  const heading = document.createElement('h2')
  heading.textContent = 'Entries'

  const label = document.createElement('span')
  label.className = 'entries-count'
  label.dataset.count = String(count)
  label.textContent = entryCountLabel(count)

  header.append(heading, label)
  return header
}

/**
 * The fade at the foot of the screen: entries scrolled behind the bottom
 * buttons are covered by the page's own colour instead of running under them.
 * It says nothing and takes no taps, so it is hidden from assistive technology
 * and passes every touch through to the list beneath it.
 */
const renderFade = (): HTMLElement => {
  const fade = document.createElement('div')
  fade.className = 'list-fade'
  fade.dataset.fade = ''
  fade.setAttribute('aria-hidden', 'true')
  return fade
}

/**
 * The centre line the entries lie either side of, and the area it runs down.
 * The line is decoration - the sides and the cards already say which half each
 * entry belongs to - so it is hidden from assistive technology; it is an
 * element rather than a pseudo-element because the opening entrance draws it
 * down from its top, and it carries data-spine, which is how it is named.
 */
const renderEntriesArea = (list: HTMLElement): HTMLElement => {
  const area = document.createElement('div')
  area.className = 'entries-area'

  const spine = document.createElement('div')
  spine.className = 'list-spine'
  spine.dataset.spine = ''
  spine.setAttribute('aria-hidden', 'true')

  area.append(spine, list)
  return area
}

const renderEmptyHint = (): HTMLElement => {
  const hint = document.createElement('div')
  hint.className = 'empty-hint'
  hint.dataset.emptyHint = ''

  const title = document.createElement('p')
  title.className = 'empty-hint-title'
  title.textContent = 'No entries yet'

  const body = document.createElement('p')
  body.textContent =
    "Tap Send when you pay someone on Abbaas's behalf. Tap Receive when he pays you back."

  hint.append(title, body)
  return hint
}

const renderBottomButton = (action: 'send' | 'receive'): HTMLElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bottom-button'
  button.dataset.action = action

  // The arrow is decoration only, so it stays out of the accessible name, which
  // must read exactly Send or Receive.
  const arrow = document.createElement('span')
  arrow.className = 'bottom-arrow'
  arrow.setAttribute('aria-hidden', 'true')
  arrow.textContent = action === 'send' ? '↗' : '↙'

  const label = document.createElement('span')
  label.textContent = action === 'send' ? 'Send' : 'Receive'

  button.append(arrow, label)
  return button
}

const renderBottomBar = (): HTMLElement => {
  const bar = document.createElement('div')
  bar.className = 'bottom-bar'
  // Send on the left half, Receive on the right half. Tapping them opens their
  // forms only in later values; here they exist, are named and sit in place.
  bar.append(renderBottomButton('send'), renderBottomButton('receive'))
  return bar
}

/**
 * What Home needs to know about a save that has just happened: which entry it
 * was, so that card crosses the line wearing its ring, and where the
 * boxes count from. Home itself holds no id.
 *
 * Refined board value 5 removes the Saved message and its Undo, so a save
 * leaves Home nothing to say and nothing to take back: the ringed card on its
 * own side is the whole of the feedback, and this carries no callback at all.
 */
export type JustSaved = {
  /** Which entry was saved: the card that crosses the line wearing its ring. */
  readonly entryId: string
  /** The balance before the save: where the boxes count from (value 9). */
  readonly balanceBefore: Balance
}

/**
 * The motion of a save, started on the screen that is about to be mounted.
 *
 * Home is painted in its end state first and always: the entry is in the list,
 * each box carries the amount and state it ends with, and this only travels to
 * them. So a device that asked for reduced motion - where every call below does
 * nothing at all - reads exactly the same screen, at once.
 *
 * Which boxes move decides what the motion is called: one box changing is a
 * count of that box, and both changing means the money has crossed the line, so
 * the pair of them is one swap - his box draining as the owner's fills when a
 * payment is larger than he holds.
 *
 * The new card is shown on the half the money came FROM and crosses the centre
 * line to the half it rests in, which is the receiver's: the card and the money
 * travel together, so the boxes start counting as the crossing begins.
 *
 * The ring the new card wears is not motion and so is drawn whatever this
 * device has asked for: it is how the card that has just been saved is told
 * apart until the next screen, and since value 5 took the Saved message away it
 * is the whole of what a save says.
 */
const animateSave = (
  screen: HTMLElement,
  saved: JustSaved,
  after: Balance,
  entries: readonly LedgerEntry[],
): void => {
  const entry = entries.find((candidate) => candidate.id === saved.entryId)
  const element = screen.querySelector<HTMLElement>(`[data-entry="${saved.entryId}"]`)
  if (entry !== undefined && element !== null) {
    // The 2 px ring in the entry's own colour, which stays until the next screen.
    element.classList.add('entry-card-new')
    // It appears on the SENDER'S half and crosses the centre line to the half it
    // rests in, which is the side of whoever received the money: data-side is
    // already that side, so it is the whole of what the crossing needs to know.
    // The dot on the line and the after line arrive once the card has landed.
    const row = element.closest<HTMLElement>('.entry')
    crossEntry({
      card: element,
      trailing:
        row === null
          ? []
          : Array.from(row.querySelectorAll<HTMLElement>('.entry-node-cell, .entry-after')),
      restsOn: row?.dataset.side === 'left' ? 'left' : 'right',
    })
    // A day this entry is the first of opens its space, so the days under it
    // move down rather than jump. A day that already held entries has its space
    // and needs none made.
    const group = element.closest<HTMLElement>('[data-day]')
    if (group !== null && group.querySelectorAll('[data-entry]').length === 1) {
      openDayGroup(group)
    }
  }

  const moved = (['you', 'abbaas'] as const)
    .map((who) => ({
      who,
      fromCents: boxFor(saved.balanceBefore, who).amountCents,
      toCents: boxFor(after, who).amountCents,
    }))
    .filter((move) => move.fromCents !== move.toCents)

  const name = moved.length > 1 ? 'swap' : 'count'
  for (const move of moved) {
    const box = screen.querySelector<HTMLElement>(`[data-box="${move.who}"]`)
    if (box === null) continue
    // The same painter the box itself was painted with, so every frame of the
    // count reads in the figures the owner is already looking at - cents and
    // all - and lands exactly on them.
    countBoxAmount(box, {
      fromCents: move.fromCents,
      toCents: move.toCents,
      name,
      // The money moves with the card: the count starts as the crossing does and
      // takes the same 800 ms whether one box counts or the two of them swap.
      durationMs: SAVE_COUNT_MS,
      delayMs: CROSS_START_MS,
      paint: paintBoxAmount,
    })
  }

  // And that is all a save does: no message rises after it and nothing offers
  // to take it back.
}

/**
 * The entrance Home plays when the app opens, gathered from the screen that has
 * just been built: which parts there are is this file's business, and how each
 * of them travels is motion.ts's.
 *
 * Travelling cards makes every card of this entrance cross the centre line, the
 * same one way a saved card reaches Home: each is handed over with the half it
 * rests in - the side of whoever received the money - and starts on the other.
 *
 * Only the holder's figure counts, because an empty box claims nothing and so
 * has nothing to count up to; at square neither box counts and the entrance is
 * the rest of it.
 *
 * Home is already painted in its end state, so this only travels to what is
 * written: with reduced motion asked for enterHome does nothing and the screen
 * below is read at once.
 */
const animateOpening = (screen: HTMLElement, balance: Balance): void => {
  const cards = Array.from(screen.querySelectorAll<HTMLElement>('.entry')).flatMap((row) => {
    const card = row.querySelector<HTMLElement>('[data-entry]')
    if (card === null) return []
    // data-side is already the half it rests in - the side of whoever RECEIVED
    // the money - which is the whole of what the crossing needs to know: it
    // starts on the other half, its sender's, and travels over the line to this
    // one.
    const restsOn = row.dataset.side === 'left' ? ('left' as const) : ('right' as const)
    return [{ element: card, restsOn }]
  })

  const holder = balance.holder === 'none' ? null : balance.holder
  const amount =
    holder === null
      ? null
      : screen.querySelector<HTMLElement>(`[data-box="${holder}"] [data-box-amount]`)
  // Only the holder has a figure to count up to: an empty box claims nothing,
  // and at square neither box does.
  const count: OpeningCount | null =
    amount === null ? null : { amount, toCents: balance.amountCents, paint: paintBoxAmount }

  const opening: Opening = {
    boxes: Array.from(screen.querySelectorAll<HTMLElement>('[data-box]')),
    spine: screen.querySelector<HTMLElement>('[data-spine]'),
    cards,
    // The square chip, the totals, the Entries heading and the hint an empty
    // ledger shows all simply fade in where they are.
    fades: Array.from(
      screen.querySelectorAll<HTMLElement>(
        '[data-square], .totals, .entries-header, [data-empty-hint]',
      ),
    ),
    actions: Array.from(screen.querySelectorAll<HTMLElement>('[data-action]')),
    count,
  }
  enterHome(screen, opening)
}

/* Refined board value 5: Home has no Saved message and no Undo, at any moment.
   Nothing here builds a data-saved-message element, a role=status save notice,
   the word 'Saved.' or a control named Undo, so there is no sentence to word
   and no bar to raise. A save is answered by the new card alone: it is shown on
   the sender's half wearing the 2 px ring in its colour, crosses the centre line
   to rest on the receiver's half while the boxes count to their new figures, and
   the stored row stays stored - which is
   why LedgerStore.removeEntry, still there for a later delete feature, is
   reached by nothing on this screen. */

/**
 * Home, and whether this is the Home the app opens on: only that one plays the
 * entrance, and a Home reached by a save plays the save's own motion instead.
 * Which Home is which is remembered by the composition root, not here.
 */
export const renderHome = (
  ledger: ReadEntriesOutcome,
  saved?: JustSaved,
  opening = false,
): HTMLElement => {
  const screen = document.createElement('section')
  screen.dataset.screen = 'home'
  screen.className = 'screen home'

  // No title and no heading above the boxes: the two boxes are what the owner
  // reads first, and the app's own name is not news to him.

  if (ledger.outcome === 'retry') {
    // An empty ledger and a failed read must never look alike, so a Retry shows
    // a spoken notice and NO entry elements at all.
    const notice = document.createElement('p')
    notice.setAttribute('role', 'alert')
    notice.textContent = ledger.message
    screen.append(notice)
    return screen
  }

  // The balance comes from the read entries alone, so a failed read (handled
  // above) can never be painted as an empty, all-square ledger.
  const balance = balanceOf(ledger.entries)
  screen.append(renderBalanceCard(balance))

  screen.append(renderEntriesHeader(ledger.entries.length))

  if (ledger.entries.length === 0) screen.append(renderEmptyHint())

  const list = document.createElement('ul')
  list.dataset.entries = ''
  // Newest day first, newest saved first within a day, each entry carrying what
  // it leaves behind it: all of it decided by the pure projection.
  for (const group of groupEntriesByDay(ledger.entries, deviceToday())) {
    list.append(renderDayGroup(group))
  }
  screen.append(renderEntriesArea(list))

  // Nothing is appended for a save: there is no message to mount, so the screen
  // after a save holds exactly what every other Home holds.

  // The fade before the bar, so the buttons are read over it.
  screen.append(renderFade())
  screen.append(renderBottomBar())

  // Last, so the motion finds the whole screen already built. A save's motion
  // and the opening entrance are never both played: a save is not an opening,
  // and an Undo, a back button or a plain visit to Home plays neither.
  if (saved !== undefined) animateSave(screen, saved, balance, ledger.entries)
  else if (opening) animateOpening(screen, balance)

  return screen
}
