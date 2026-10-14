// The entry sheet: one recorded entry, read as it was stored, raised over the
// dimmed Home that is still mounted underneath it.
//
// The sheet is handed a LedgerEntry, a way to leave and a way to remove that one
// entry. It still knows no store and no account: it asks before it removes, it
// calls what it was handed at most once per confirmation, and it never touches
// Home. So Home's count, its boxes and its totals cannot move from in here - a
// removal that goes through hands back to the router, which repaints Home from a
// fresh read, and a removal that fails leaves both the page and the rows alone.
//
// The attribute contract this value adds, and every later value keeps:
//   - the sheet carries data-entry-sheet="<entries.id>", role=dialog,
//     aria-modal=true and aria-labelledby its own title
//   - the full-screen dim layer under it carries data-sheet-scrim
//   - the dollar figure carries data-sheet-usd
//   - an MVR entry's rufiyaa figure carries data-sheet-mvr and its rate
//     data-sheet-rate; a USD entry has neither row
//   - a send's person carries data-sheet-person; a payment has no such row
//   - the day carries data-sheet-date, worded exactly as Home's day label is
//   - the foot offers Delete and Close at rest; tapping Delete turns it, in
//     place, into 'Delete this entry?' with Cancel and Delete and no Close; a
//     removal that could not land puts a role=alert note above Delete and Close
//     again. Every detail above the foot is unchanged in all of them.
// Nothing here carries data-entry, data-person or any other attribute of Home's
// own contract: the sheet is a second reading of an entry, not a second copy of
// the list.
import { dayLabel, deviceToday } from '../domain/ledger-view.js'
import { formatMvrLaari, formatRate, formatUsdCents } from '../domain/money.js'
import {
  ENTRY_UNREMOVABLE_MESSAGE,
  type LedgerEntry,
  type RemoveEntryOutcome,
} from '../ports/ledger-store.js'
import { lowerSheet, raiseSheet } from './motion.js'

/** The one element the sheet is named by, which aria-labelledby points at. */
const TITLE_ID = 'entry-sheet-title'

/** How the sheet reads what kind of entry this is. */
const titleOf = (entry: LedgerEntry): string =>
  entry.kind === 'send' ? 'Sent for Abbaas' : 'Paid back by Abbaas'

/**
 * One detail row: a muted label and an inked value, the value carrying the
 * attribute the row is named by. The hairline between rows is the stylesheet's
 * business, so a row added later needs no change here.
 */
const renderRow = (label: string, value: string, name: string): HTMLElement => {
  const row = document.createElement('div')
  row.className = 'sheet-row'

  const key = document.createElement('span')
  key.className = 'sheet-row-label'
  key.textContent = label

  const read = document.createElement('span')
  read.className = 'sheet-row-value'
  read.dataset[name] = ''
  read.textContent = value

  row.append(key, read)
  return row
}

/**
 * The rows this entry has, in the order the board reads them. What an entry is
 * not never appears: a USD entry has no rufiyaa figure and no rate to show, and
 * a payment from Abbaas was paid to nobody, so neither row is built at all
 * rather than built empty.
 */
const renderRows = (entry: LedgerEntry): readonly HTMLElement[] => {
  const rows: HTMLElement[] = []

  if (entry.currency === 'MVR') {
    rows.push(renderRow('Amount', `MVR ${formatMvrLaari(entry.amountMinor)}`, 'sheetMvr'))
    // A stored MVR row always carries its rate; without one there is nothing to
    // claim about the rate it was got at, so no row is shown.
    if (entry.rate !== null) {
      rows.push(renderRow('Rate', `${formatRate(entry.rate)} MVR per $1`, 'sheetRate'))
    }
  }

  if (entry.kind === 'send' && entry.personName !== null && entry.personName !== '') {
    rows.push(renderRow('Paid to', entry.personName, 'sheetPerson'))
  }

  // The day as Home labels it, so the same entry reads the same date in both
  // places: the words come from the one projection that words them.
  rows.push(renderRow('Date', dayLabel(entry.entryDate, deviceToday()), 'sheetDate'))

  return rows
}

const renderSheet = (entry: LedgerEntry): HTMLElement => {
  const sheet = document.createElement('div')
  sheet.className = 'entry-sheet'
  // The sheet is the entry: this is how a reader names the sheet it is looking at.
  sheet.dataset.entrySheet = entry.id
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  sheet.setAttribute('aria-labelledby', TITLE_ID)
  sheet.dataset.sheetKind = entry.kind

  const title = document.createElement('h2')
  title.className = 'sheet-title'
  title.id = TITLE_ID

  // The dot is the entry's colour said twice: it repeats what the title and the
  // figure already say, so it is decoration and stays out of the name.
  const dot = document.createElement('span')
  dot.className = 'sheet-dot'
  dot.setAttribute('aria-hidden', 'true')

  const words = document.createElement('span')
  words.textContent = titleOf(entry)
  title.append(dot, words)

  const usd = document.createElement('p')
  usd.className = 'sheet-usd'
  usd.dataset.sheetUsd = ''
  // Formatted exactly as Home formats it, by the same function.
  usd.textContent = formatUsdCents(entry.usdCents)

  const rows = document.createElement('div')
  rows.className = 'sheet-rows'
  rows.append(...renderRows(entry))

  // The foot is the one part of the sheet that changes, so it is left empty
  // here and painted from its state below. The details above it are built once
  // and never rebuilt, which is what keeps the entry readable in every state.
  const foot = document.createElement('div')
  foot.className = 'sheet-foot'

  sheet.append(title, usd, rows, foot)
  return sheet
}

/**
 * What the foot is saying right now.
 *   - 'rest': Delete and Close, and no question.
 *   - 'confirm': the question, its hint, then Cancel and Delete. No Close.
 *   - 'running': the same two buttons, both disabled, while the removal is out.
 *   - 'retry': Delete and Close again, with the role=alert note above them.
 * The details above the foot are the same in all four.
 */
type FootState = 'rest' | 'confirm' | 'running' | 'retry'

/** One button of the foot, built the one way so all four states match. */
const footButton = (label: string, className: string): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = label
  return button
}

/** A sheet that is open: which entry it reads, and the one way to close it. */
export type OpenEntrySheet = {
  readonly entryId: string
  /** Closes the sheet, plays its fall and hands focus back. Idempotent. */
  readonly close: () => void
  /**
   * Resolves once the sheet is wholly out of the DOM, so a caller that means to
   * repaint the Home underneath can let the fall land first instead of
   * replacing the screen the sheet is still falling inside.
   */
  readonly closed: Promise<void>
}

export type EntrySheetHandlers = {
  /**
   * What a close asks for: the hash walk back to Home. The sheet never removes
   * itself behind the router's back, so Close, the scrim, Escape and the phone's
   * back button all travel the one path.
   */
  readonly onLeave: () => void
  /**
   * What a confirmed Delete asks for: the one removal of this entry. The sheet
   * calls it at most once per confirmation and judges nothing itself - a
   * 'removed' is the store's word that the row is gone, a 'retry' its word that
   * it is still there.
   */
  readonly onDelete: () => Promise<RemoveEntryOutcome>
  /**
   * The entry is gone from storage. The sheet has nothing left to read, so it
   * hands over: the router closes it, leaves its history entry behind and
   * repaints Home from a fresh read.
   */
  readonly onRemoved: () => void
}

/**
 * Raises this entry's sheet over the Home that is already mounted, which is left
 * exactly as it was: nothing of Home is rebuilt, repainted or re-read, so its
 * count, its boxes and its totals cannot move while the sheet is up, and no
 * entrance of Home's can be replayed by opening one.
 *
 * The scrim is appended first and the sheet over it, both inside Home's own
 * screen: a screen that is replaced takes them with it, so a sheet can never
 * outlive the Home it was raised over.
 *
 * Focus moves to Close when it opens and returns to the element the sheet was
 * opened from when it closes, so a sheet opened from a card hands the card back.
 */
export const openEntrySheet = (
  screen: HTMLElement,
  entry: LedgerEntry,
  openedFrom: HTMLElement | null,
  handlers: EntrySheetHandlers,
): OpenEntrySheet => {
  const scrim = document.createElement('div')
  scrim.className = 'sheet-scrim'
  scrim.dataset.sheetScrim = ''

  const sheet = renderSheet(entry)
  screen.append(scrim, sheet)

  // A tap on the dimmed Home is a close: the scrim is the whole of Home as far
  // as a tap is concerned, and the sheet over it takes its own taps.
  scrim.addEventListener('click', () => {
    // A removal already out is left to answer, as Escape is: the owner is told
    // whether the entry went rather than being dropped back onto Home mid-write.
    if (running) return
    handlers.onLeave()
  })

  const foot = sheet.querySelector<HTMLElement>('.sheet-foot')

  /**
   * Whether a removal is out right now. It guards the second tap: the buttons
   * are disabled while it runs, and this refuses anything that reaches the
   * handler anyway, so removeEntry is called exactly once per confirmation.
   */
  let running = false

  /**
   * Paints the foot for one state, in place, under the details that stay. The
   * buttons are rebuilt each time rather than hidden, so the set a reader is
   * offered IS the set that exists: while the question is up there is no Close
   * at all, and at rest there is no Cancel.
   *
   * `takeFocus` keeps the keyboard inside the sheet across a repaint, because
   * the button that was focused has just left the DOM.
   */
  const paintFoot = (state: FootState, takeFocus = true): void => {
    if (foot === null) return
    foot.replaceChildren()

    if (state === 'confirm' || state === 'running') {
      const ask = document.createElement('div')
      ask.className = 'sheet-ask'

      const question = document.createElement('p')
      question.className = 'sheet-ask-question'
      question.textContent = 'Delete this entry?'

      const hint = document.createElement('p')
      hint.className = 'sheet-ask-hint'
      hint.textContent = 'This cannot be undone.'

      ask.append(question, hint)
      foot.append(ask)
    }

    if (state === 'retry') {
      // Spoken the moment it is painted: the owner's tap did not land, and the
      // entry they are still looking at is still there.
      const note = document.createElement('p')
      note.className = 'sheet-note'
      note.setAttribute('role', 'alert')
      note.textContent = ENTRY_UNREMOVABLE_MESSAGE
      foot.append(note)
    }

    const actions = document.createElement('div')
    actions.className = 'sheet-actions'
    const asking = state === 'confirm' || state === 'running'
    // Side by side while confirming, stacked otherwise; the shape is the
    // stylesheet's business and this is the handle it hangs on.
    actions.dataset.sheetActions = asking ? 'confirm' : 'rest'

    if (asking) {
      const cancel = footButton('Cancel', 'sheet-cancel')
      const confirm = footButton('Delete', 'sheet-delete')
      confirm.dataset.sheetDelete = ''
      // While the removal is out neither button can be tapped again, which is
      // what makes a second tap do nothing rather than remove twice.
      cancel.disabled = state === 'running'
      confirm.disabled = state === 'running'

      cancel.addEventListener('click', () => {
        // Nothing has been written, so there is nothing to take back: the foot
        // simply stops asking.
        if (running) return
        paintFoot('rest')
      })
      confirm.addEventListener('click', () => {
        void runDelete()
      })

      actions.append(cancel, confirm)
      foot.append(actions)
      if (takeFocus) cancel.focus()
      return
    }

    const remove = footButton('Delete', 'sheet-delete')
    remove.dataset.sheetDelete = ''
    remove.addEventListener('click', () => {
      // Tapping Delete asks; it does not delete.
      paintFoot('confirm')
    })

    const close = footButton('Close', 'sheet-close')
    close.dataset.sheetClose = ''
    close.addEventListener('click', () => {
      handlers.onLeave()
    })

    // Close on the left and the red Delete on the right, so Delete sits where the
    // confirming Delete will appear and the second tap lands on the same spot.
    actions.append(close, remove)
    foot.append(actions)
    if (takeFocus) remove.focus()
  }

  /**
   * The one removal. The foot goes to 'running' first, so the confirmation that
   * was tapped cannot be tapped again, and the store's answer decides what the
   * sheet becomes: gone, or open again with the note above its buttons.
   */
  async function runDelete(): Promise<void> {
    if (running) return
    running = true
    paintFoot('running', false)
    const outcome = await handlers.onDelete()
    running = false
    if (outcome.outcome === 'removed') {
      // The entry this sheet reads is gone, so the sheet has nothing to be.
      handlers.onRemoved()
      return
    }
    // Still stored and still listed: the sheet stays on its details and says so.
    paintFoot('retry')
  }

  // The sheet opens at rest; focus is handed in below, once it has been raised.
  paintFoot('rest', false)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      // A removal that is already out is left to answer: closing over it would
      // leave the owner with no word on whether the entry went.
      if (running) return
      event.preventDefault()
      handlers.onLeave()
    }
  }
  // On the window, because the scrim can take the focus out of the sheet and
  // Escape must still close it.
  window.addEventListener('keydown', onKeyDown)

  let closed = false
  // Resolved by the fall's own end, so 'the sheet is gone' is one thing every
  // caller can wait for rather than a timing each one guesses at.
  let settle: () => void = () => {}
  const closedPromise = new Promise<void>((resolve) => {
    settle = resolve
  })
  const close = (): void => {
    if (closed) return
    closed = true
    window.removeEventListener('keydown', onKeyDown)
    lowerSheet(sheet, scrim, () => {
      sheet.remove()
      scrim.remove()
      // Handed back only once the sheet is wholly gone, so a reader that waits
      // for the fall to end finds the focus already where it belongs.
      if (openedFrom !== null && openedFrom.isConnected) openedFrom.focus()
      settle()
    })
  }

  raiseSheet(sheet, scrim)
  // Into the sheet at once: the owner is reading the sheet, not the Home under it.
  sheet.querySelector<HTMLElement>('[data-sheet-close]')?.focus()

  return { entryId: entry.id, close, closed: closedPromise }
}
