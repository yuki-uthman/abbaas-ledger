// Home as a function from the read ledger to DOM: the account's entries, newest
// first, under the balance card.
//
// Value 5 adds repayments to what Home reads, and needs no new shape to do it,
// because the projection and the attribute contract below already answer for
// them: balanceOf subtracts a receive, so the owner's box fills (unsigned, with
// the caption 'have his money') and Abbaas's empties when a payment is larger
// than he held, and the All square chip appears exactly at zero; a receive
// renders on the left of the centre line beside a teal node with a left-pointing
// arrow, reads 'from Abbaas' and carries no data-person.
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
// Value 9 adds the motion of a save to this same screen and takes nothing away
// from it: Home is still painted in its end state, and the motion only travels
// to what is already written. With reduced motion asked for, none of it runs.
import { balanceOf, boxFor, type Balance } from '../domain/balance.js'
import { deviceToday, groupEntriesByDay, type ListedEntry } from '../domain/ledger-view.js'
import { formatMvrLaari, formatRate, formatUsdCents } from '../domain/money.js'
import type {
  LedgerEntry,
  ReadEntriesOutcome,
  RemoveEntryOutcome,
} from '../ports/ledger-store.js'
import { countBoxAmount, enterEntry } from './motion.js'

export { formatUsdCents }

/**
 * The detail line under the USD amount: an MVR entry names the rufiyaa figure
 * and the rate it was got at ('MVR 10,000 at 20.00'); a USD one reads
 * 'Paid in USD'.
 */
const detailOf = (entry: LedgerEntry): string => {
  if (entry.currency === 'USD') return 'Paid in USD'
  const amount = formatMvrLaari(entry.amountMinor)
  // A stored MVR row always carries its rate; without one there is nothing to
  // claim beyond the rufiyaa figure.
  if (entry.rate === null) return `MVR ${amount}`
  return `MVR ${amount} at ${formatRate(entry.rate)}`
}

const renderEntry = (listed: ListedEntry<LedgerEntry>): HTMLElement => {
  const entry = listed.entry
  const element = document.createElement('li')
  element.dataset.entry = entry.id
  element.className = 'entry'
  // The standing this entry leaves behind it, signed: positive when Abbaas holds
  // the owner's money, negative when the owner holds his, 0 when square.
  element.dataset.after = String(listed.afterCents)
  // A send sits wholly in the right half of the centre line; a repayment from
  // Abbaas takes the left half (value 5). The halves are drawn in theme.css.
  element.dataset.side = entry.kind === 'send' ? 'right' : 'left'

  // The round node on the line, an arrow pointing the way the money went.
  const node = document.createElement('span')
  node.className = 'entry-node'
  node.setAttribute('aria-hidden', 'true')
  node.textContent = entry.kind === 'send' ? '→' : '←'

  const body = document.createElement('div')
  body.className = 'entry-body'

  const amount = document.createElement('span')
  amount.className = 'entry-amount'
  amount.textContent = formatUsdCents(entry.usdCents)

  const party = document.createElement('span')
  party.className = 'entry-party'
  if (entry.kind === 'send' && entry.personId !== null) {
    // A send names who was paid, and carries that person's id.
    party.dataset.person = entry.personId
    party.textContent = `to ${entry.personName ?? ''}`.trimEnd()
  } else if (entry.kind === 'send') {
    party.textContent = `to ${entry.personName ?? ''}`.trimEnd()
  } else {
    // A repayment names nobody, so it carries no data-person.
    party.textContent = 'from Abbaas'
  }

  const detail = document.createElement('span')
  detail.className = 'entry-detail'
  detail.textContent = detailOf(entry)

  // Who holds what after this entry, read across the line from the money that
  // caused it: teal when Abbaas holds, blue when the owner does, grey at square.
  const after = document.createElement('span')
  after.className = 'entry-after'
  after.dataset.afterHolder = listed.afterHolder
  after.textContent = listed.afterText

  body.append(amount, party, detail)
  element.append(node, body, after)
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
  // The amount is never signed: an empty box reads $0, a filled one $1,234.56.
  amount.textContent = box.state === 'empty' ? '$0' : formatUsdCents(box.amountCents)

  const caption = document.createElement('span')
  caption.className = 'box-caption'
  caption.textContent = box.state === 'empty' ? look.emptyCaption : look.filledCaption

  element.append(pill, amount, caption)
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
    square.textContent = 'All square'
    card.append(square)
  }

  const totals = document.createElement('p')
  totals.className = 'totals'
  const sent = document.createElement('span')
  sent.dataset.total = 'sent'
  sent.textContent = `You sent ${formatUsdCents(balance.sentCents)}`
  const paid = document.createElement('span')
  paid.dataset.total = 'paid'
  paid.textContent = `He paid back ${formatUsdCents(balance.paidBackCents)}`
  totals.append(sent, paid)
  card.append(totals)

  return card
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
 * What Home needs to speak for a save that has just happened (value 7): the one
 * thing it can do about it. Home itself holds no id; the composition root
 * remembers which entry was saved and what taking it back means.
 */
export type JustSaved = {
  /** Which entry was saved: the one that arrives from its own side (value 9). */
  readonly entryId: string
  /** The balance before the save: where the boxes count from (value 9). */
  readonly balanceBefore: Balance
  /** Removes the entry just saved. A Retry is reported in the message itself. */
  readonly onUndo: () => Promise<RemoveEntryOutcome>
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
 * the pair of them is one swap.
 */
const animateSave = (
  screen: HTMLElement,
  saved: JustSaved,
  after: Balance,
  entries: readonly LedgerEntry[],
): void => {
  const entry = entries.find((candidate) => candidate.id === saved.entryId)
  const element = screen.querySelector<HTMLElement>(`[data-entry="${saved.entryId}"]`)
  if (entry !== undefined && element !== null) enterEntry(element, entry.kind)

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
    // The same formatter the box itself was painted with, so the count reads in
    // the figures the owner is already looking at and lands exactly on them.
    countBoxAmount(box, {
      fromCents: move.fromCents,
      toCents: move.toCents,
      name,
      format: formatUsdCents,
    })
  }
}

/**
 * The sentence the Saved message reads, from the balance AFTER the save, which
 * is the balance Home is already showing.
 */
const savedTextOf = (balance: Balance): string => {
  if (balance.holder === 'abbaas') {
    return `Saved. Abbaas now has ${formatUsdCents(balance.amountCents)} of yours.`
  }
  if (balance.holder === 'you') {
    return `Saved. You now have ${formatUsdCents(balance.amountCents)} of his.`
  }
  return 'Saved. You are all square.'
}

/**
 * The Saved message with its Undo button: role=status, so a screen reader hears
 * it without the focus moving, and data-saved-message, which is the stable
 * handle. It sits above the bottom buttons and never covers them (theme.css).
 *
 * The message's own text is the sentence alone. The Undo button carries its name
 * on aria-label and draws its word from CSS, so the sentence stays exactly what
 * it claims to be while the button is still named Undo for anyone reading it.
 */
const renderSavedMessage = (balance: Balance, saved: JustSaved): HTMLElement => {
  const message = document.createElement('p')
  message.setAttribute('role', 'status')
  message.dataset.savedMessage = ''
  message.className = 'saved-message'

  const text = document.createElement('span')
  text.className = 'saved-text'
  text.textContent = savedTextOf(balance)

  const undo = document.createElement('button')
  undo.type = 'button'
  undo.className = 'undo-button'
  undo.setAttribute('aria-label', 'Undo')

  message.append(text, undo)

  // An Undo that could not reach the store changes nothing but this message: the
  // entry is still held, so it stays listed and the owner can tap Undo again.
  let asking = false
  undo.addEventListener('click', () => {
    if (asking) return
    asking = true
    void saved.onUndo().then((outcome) => {
      asking = false
      if (outcome.outcome === 'removed') return
      const existing = message.querySelector<HTMLElement>('[data-undo-error]')
      const error = existing ?? document.createElement('span')
      error.className = 'undo-error'
      error.dataset.undoError = ''
      error.textContent = outcome.message
      if (existing === null) message.append(error)
    })
  })

  return message
}

export const renderHome = (ledger: ReadEntriesOutcome, saved?: JustSaved): HTMLElement => {
  const screen = document.createElement('section')
  screen.dataset.screen = 'home'
  screen.className = 'screen home'

  const title = document.createElement('h1')
  title.textContent = 'Abbaas Ledger'
  screen.append(title)

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

  if (ledger.entries.length === 0) screen.append(renderEmptyHint())

  const list = document.createElement('ul')
  list.dataset.entries = ''
  // Newest day first, newest saved first within a day, each entry carrying what
  // it leaves behind it: all of it decided by the pure projection.
  for (const group of groupEntriesByDay(ledger.entries, deviceToday())) {
    list.append(renderDayGroup(group))
  }
  screen.append(list)

  // Only right after a save, and only until Undo, leaving Home or a reload: the
  // composition root is what remembers that, so a reload never shows this.
  if (saved !== undefined) screen.append(renderSavedMessage(balance, saved))

  screen.append(renderBottomBar())

  // Last, so the motion finds the whole screen already built, and only for a
  // save: an Undo, a reload or a plain visit shows this screen still.
  if (saved !== undefined) animateSave(screen, saved, balance, ledger.entries)

  return screen
}
