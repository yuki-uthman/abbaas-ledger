// The teal full-screen receive form, as on the refined board. It is the send
// form's own frame in the colour the money comes from: a repayment is money back
// from Abbaas himself, so there is no person to choose and nothing to add. Every
// number it shows comes from the pure draft functions, so the figure on the save
// button and the row that is stored are the same arithmetic.
//
// The attribute contract this value fixes, and every later value keeps:
//   - the root carries data-form="receive"
//   - the currency switch carries one data-pill element under the pressed half
//   - the amount's prefix carries data-prefix
//   - the save button's accessible name is 'Receive · $X'
//   - in MVR, and only in MVR, the row under the amount offers the labelled
//     'Rate · MVR per $1' field and a data-usd output holding the dollars that
//     rate works the typed rufiyaa out to - the same figure the button names and
//     the same figure that is stored
//
// The refined board removed what version one showed here: there are no quick
// amounts, no note field, no after-saving preview and no over-payment note, so
// no data-quick, no data-receive-note, no data-preview-box and no 'After saving'
// words exist on this form at all.
//
// Method value 2 adds the Method row to the contract:
//   - between the amount (with the rate row that belongs to it) and the date
//     there is one element with role="radiogroup" named 'Method', holding
//     exactly three role="radio" buttons named 'Cash', 'Cheque' and 'Transfer'
//     in that order, each carrying data-method and aria-checked, with
//     aria-checked="true" on exactly one of the three at every moment
//   - the form opens on Cheque, every time, and the currency switch does not
//     change which method is chosen
//
// Refined board value 7 adds to the contract one attribute of its own:
//   - each row of the form carries data-row, in the order they are read down it
// A form opened by a tap rises those rows in one after another once the circle
// has started filling the screen; one reached by the back button, or by a visit
// straight to the hash, is shown whole. The rate row is not one of them: it is
// closed and unreadable in USD, and it has an opening of its own.
import type { Balance } from '../domain/balance.js'
import { formatUsdCents } from '../domain/money.js'
import {
  canSaveReceive,
  emptyReceiveDraft,
  receiveToNewEntry,
  receiveUsdCents,
  type ReceiveDraft,
} from '../domain/receive-draft.js'
import { dateChipWords, todayIso } from '../domain/send-draft.js'
import type { AddEntryOutcome, NewEntry, PaymentMethod } from '../ports/ledger-store.js'
import { centreOf, enterRows, pressAndDim, revealFrom, type Point } from './motion.js'

export type ReceiveFormHandlers = {
  /** Close without saving: the browser back button does the same thing. */
  readonly onClose: () => void
  /**
   * Stores the payment. The origin is the centre of the save button that was
   * tapped, in viewport pixels: the point Home grows from once the payment is
   * stored (value 9), measured here because only this screen knows where its
   * own button is.
   */
  readonly onSave: (entry: NewEntry, origin: Point) => Promise<AddEntryOutcome>
}

export type ReceiveFormState = {
  /** The balance before this payment; the standing line reads it out. */
  readonly balance: Balance
  /**
   * Where the Receive button was tapped, in viewport pixels: the form grows as
   * a circle from there (value 9). An arrival with no tap behind it - the back
   * or forward button, or a visit straight to #receive - has no point to grow
   * from and shows the form whole.
   */
  readonly origin?: Point | null
}

/**
 * The line that says where the ledger stands before this payment, as the pieces
 * it is drawn from: the figure inside it is bold, the words around it are not.
 */
const standingParts = (balance: Balance): readonly Node[] => {
  if (balance.holder === 'none') return [document.createTextNode('All square')]
  const amount = document.createElement('strong')
  amount.className = 'standing-amount'
  amount.textContent = formatUsdCents(balance.amountCents)
  const [before, after] =
    balance.holder === 'abbaas' ? ['Abbaas has ', ' of yours'] : ['You have ', ' of his']
  return [document.createTextNode(before), amount, document.createTextNode(after)]
}

const labelled = (
  text: string,
  input: HTMLInputElement,
  id: string,
  prefix?: string,
): HTMLElement => {
  const field = document.createElement('div')
  field.className = 'field'

  const label = document.createElement('label')
  label.htmlFor = id
  label.textContent = text
  input.id = id

  const row = document.createElement('div')
  row.className = 'field-row'
  if (prefix !== undefined) {
    const mark = document.createElement('span')
    mark.className = 'field-prefix'
    mark.dataset.prefix = ''
    mark.setAttribute('aria-hidden', 'true')
    mark.textContent = prefix
    row.append(mark)
  }
  row.append(input)

  field.append(label, row)
  return field
}

const textInput = (type: string): HTMLInputElement => {
  const input = document.createElement('input')
  input.type = type
  input.className = 'field-input'
  return input
}

/**
 * One of the board's line icons. Every icon is decoration beside words that
 * already say the same thing, so each is hidden from the accessible name: the
 * save button is named 'Receive · $300.00' and not 'Receive · $300.00 arrow'.
 */
const icon = (paths: readonly string[], size = 18): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2.2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  for (const definition of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', definition)
    svg.append(path)
  }
  return svg
}

const CLOSE = ['M6 6l12 12', 'M18 6 6 18']
/** The money comes back the other way, so the save button's arrow does too. */
const ARROW_DOWN_LEFT = ['M17 7 7 17', 'M15.5 17H7V8.5']
const CALENDAR = [
  'M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z',
  'M4 10h16',
  'M9 5V3',
  'M15 5V3',
]
/** Cash: a note with a coin in the middle of it. */
const BANKNOTE = ['M3 7.5h18v9H3z', 'M12 10.5a1.5 1.5 0 0 0 0 3 1.5 1.5 0 0 0 0-3z']
/** Cheque: a slip with a written line and a signature rule. */
const CHEQUE = ['M3 6.5h18v11H3z', 'M6.5 10h7', 'M6.5 14h4']
/** Transfer: two arrows passing each other, which is money moving between banks. */
const SWAP = ['M4 9h13', 'M14 6l3 3-3 3', 'M20 15H7', 'M10 12l-3 3 3 3']

/** A label that only a screen reader reads: the board draws words of its own. */
const hiddenLabel = (text: string, htmlFor: string): HTMLLabelElement => {
  const label = document.createElement('label')
  label.className = 'sr-only'
  label.htmlFor = htmlFor
  label.textContent = text
  return label
}

const currencyButton = (name: 'USD' | 'MVR', selected: boolean): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'currency-button'
  button.dataset.currency = name
  button.textContent = name
  button.setAttribute('aria-pressed', selected ? 'true' : 'false')
  return button
}

export const renderReceiveForm = (
  state: ReceiveFormState,
  handlers: ReceiveFormHandlers,
): HTMLElement => {
  // The draft is this screen's own value. It is replaced, never mutated, and
  // every answer about it comes from the pure functions in receive-draft.ts.
  let draft: ReceiveDraft = emptyReceiveDraft()

  const screen = document.createElement('section')
  screen.dataset.form = 'receive'
  screen.className = 'screen receive-form'

  // ----- Top row: the close button at the left, the standing at the right. -----
  const topRow = document.createElement('div')
  topRow.className = 'form-top'

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'form-close'
  close.setAttribute('aria-label', 'Close')
  close.append(icon(CLOSE, 20))
  close.addEventListener('click', handlers.onClose)

  const standing = document.createElement('p')
  standing.className = 'form-standing'
  // The amount inside the sentence is the only part drawn bold, so the line
  // reads as one sentence with one figure in it.
  standing.append(...standingParts(state.balance))

  topRow.append(close, standing)
  screen.append(topRow)

  // ----- The eyebrow and the title. -----
  const header = document.createElement('div')
  header.className = 'form-header'

  const eyebrow = document.createElement('p')
  eyebrow.className = 'form-eyebrow'
  eyebrow.textContent = 'New entry · Receive'

  const title = document.createElement('h1')
  title.textContent = 'Payment from Abbaas'

  header.append(eyebrow, title)
  screen.append(header)

  // ----- The currency switch: USD is chosen when the form opens. -----
  const currencies = document.createElement('div')
  currencies.className = 'currency-switch'
  currencies.setAttribute('role', 'group')
  currencies.setAttribute('aria-label', 'Currency')

  // The white pill under the pressed half. It is decoration for the pressed
  // state the buttons already carry, so it is hidden from the reading order; it
  // slides rather than jumps, which is what makes the switch read as one thing.
  const pill = document.createElement('span')
  pill.className = 'currency-pill'
  pill.dataset.pill = ''
  pill.setAttribute('aria-hidden', 'true')

  const usdButton = currencyButton('USD', true)
  const mvrButton = currencyButton('MVR', false)
  currencies.append(pill, usdButton, mvrButton)
  screen.append(currencies)

  // ----- Amount: the board's large field. -----
  const amountInput = textInput('text')
  amountInput.setAttribute('inputmode', 'decimal')
  amountInput.autocomplete = 'off'
  amountInput.classList.add('amount-input')
  const amountField = labelled('Amount received', amountInput, 'receive-amount', '$')
  amountField.classList.add('amount-field')
  const amountPrefix = amountField.querySelector<HTMLElement>('[data-prefix]')
  screen.append(amountField)

  // ----- The rate and the dollar value it works out: MVR only. -----
  // One row of two equal cards, exactly as on the send form: the rate the owner
  // got on the left and the white card that reads the dollars it works out on
  // the right. The row is closed while the currency is USD - no height and
  // nothing readable in it - so a USD form offers neither the rate label nor the
  // data-usd value.
  const rateRow = document.createElement('div')
  rateRow.className = 'rate-row'
  rateRow.dataset.open = 'false'
  screen.append(rateRow)

  const rateCard = document.createElement('div')
  rateCard.className = 'rate-card'

  const rateLabel = document.createElement('label')
  rateLabel.className = 'rate-label'
  rateLabel.htmlFor = 'receive-rate'
  rateLabel.textContent = 'Rate · MVR per $1'

  const rateInput = textInput('text')
  rateInput.setAttribute('inputmode', 'decimal')
  rateInput.autocomplete = 'off'
  rateInput.classList.remove('field-input')
  rateInput.classList.add('rate-input')
  rateInput.id = 'receive-rate'

  rateCard.append(rateLabel, rateInput)

  // The white card: what is really coming back, worked out as they type.
  const workedCard = document.createElement('div')
  workedCard.className = 'worked-card'

  const workedLabel = document.createElement('span')
  workedLabel.className = 'worked-label'
  workedLabel.textContent = 'In dollars'

  const workedValue = document.createElement('output')
  workedValue.className = 'worked-value'
  workedValue.dataset.usd = ''
  workedCard.append(workedLabel, workedValue)

  rateRow.append(rateCard, workedCard)

  // ----- Method: how the money came back. -----
  // The send form's own row, in this form's teal: one track of three equal
  // options, after the amount (and the rate row that belongs to it) and before
  // the date, which is the order the form is read in: how much, how it moved,
  // when.
  //
  // It is a real radio group: one element with role=radiogroup named by the
  // label above it, holding exactly three role=radio buttons. Exactly one of
  // them carries aria-checked='true' at every moment, so what a screen reader
  // reports and what the white pill shows can never disagree.
  const methodRow = document.createElement('div')
  methodRow.className = 'method-row'

  const methodLabel = document.createElement('p')
  methodLabel.className = 'group-label'
  methodLabel.id = 'receive-method-label'
  methodLabel.textContent = 'Method'

  const methodTrack = document.createElement('div')
  methodTrack.className = 'method-track'
  methodTrack.setAttribute('role', 'radiogroup')
  methodTrack.setAttribute('aria-labelledby', methodLabel.id)

  const METHOD_OPTIONS = [
    { method: 'cash', word: 'Cash', paths: BANKNOTE },
    { method: 'cheque', word: 'Cheque', paths: CHEQUE },
    { method: 'transfer', word: 'Transfer', paths: SWAP },
  ] as const

  const methodButtons = METHOD_OPTIONS.map((option) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'method-button'
    button.setAttribute('role', 'radio')
    button.dataset.method = option.method
    // The icon is decoration beside the word that already says the same thing,
    // so the option is named 'Cash' and not 'Cash banknote'.
    button.append(icon(option.paths, 18))
    const word = document.createElement('span')
    word.textContent = option.word
    button.append(word)
    methodTrack.append(button)
    return button
  })

  methodRow.append(methodLabel, methodTrack)
  screen.append(methodRow)

  // ----- Date: one chip with the device's own picker lying over the whole of
  // it, so tapping anywhere on the chip opens the picker. -----
  const dateGroup = document.createElement('div')
  dateGroup.className = 'date-group'

  const dateChip = document.createElement('div')
  dateChip.className = 'date-chip'

  const dateWords = document.createElement('span')
  dateWords.className = 'date-words'

  const dateInput = textInput('date')
  dateInput.classList.remove('field-input')
  dateInput.classList.add('date-input')
  dateInput.id = 'receive-date'
  dateInput.value = draft.entryDate

  dateChip.append(icon(CALENDAR, 18), dateWords, dateInput)
  dateGroup.append(hiddenLabel('Date', 'receive-date'), dateChip)
  screen.append(dateGroup)

  // ----- Save, at the foot of the column. -----
  const save = document.createElement('button')
  save.type = 'button'
  save.className = 'save-button'

  const saveWord = document.createElement('span')
  saveWord.className = 'save-word'
  save.append(saveWord, icon(ARROW_DOWN_LEFT, 18))

  const saveMessage = document.createElement('p')
  saveMessage.className = 'form-message'
  saveMessage.setAttribute('role', 'alert')

  const foot = document.createElement('div')
  foot.className = 'form-foot'
  foot.append(save, saveMessage)
  screen.append(foot)

  /** Set while the worked-out value's pop is running, so it can be restarted. */
  let popTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Repaints everything derived from the draft: the worked-out dollars, the save
   * button's name and whether it may be tapped, and the date chip's words.
   * Called on every keystroke, so what the owner reads is never one character
   * behind.
   */
  const refresh = (): void => {
    const cents = receiveUsdCents(draft)
    // The dollar value is what the balance moves by, in MVR as in USD, so the
    // button and this output read the same number.
    const worked = formatUsdCents(cents)
    if (workedValue.textContent !== worked) {
      workedValue.textContent = worked
      // The figure pops as it changes, so a value that moved cannot be missed.
      // With less motion asked for the stylesheet runs no animation at all.
      if (popTimer !== null) clearTimeout(popTimer)
      delete workedValue.dataset.pop
      // Read back, so a pop already running starts again rather than carrying on.
      void workedValue.offsetWidth
      workedValue.dataset.pop = ''
      popTimer = setTimeout(() => {
        delete workedValue.dataset.pop
        popTimer = null
      }, 200)
    }
    saveWord.textContent = `Receive · ${worked}`
    // Refused until the payment is worth something, which in MVR also means a
    // rate has been typed; a receive names nobody, so that is all.
    save.disabled = !canSaveReceive(draft)

    // The chip's words follow the picker, so the date is readable at a glance
    // without opening it: today says so by name, any other day is dated.
    dateWords.textContent = dateChipWords(draft.entryDate, todayIso())
  }

  /**
   * Switching currency keeps the typed amount and only changes how it is read:
   * MVR reveals the rate field and the worked-out dollar value, USD hides them
   * and reads the same figure as dollars.
   */
  const chooseCurrency = (currency: 'USD' | 'MVR'): void => {
    draft = { ...draft, currency }
    usdButton.setAttribute('aria-pressed', currency === 'USD' ? 'true' : 'false')
    mvrButton.setAttribute('aria-pressed', currency === 'MVR' ? 'true' : 'false')
    // The pill slides to the half that is now pressed.
    currencies.dataset.chosen = currency
    if (amountPrefix) {
      amountPrefix.textContent = currency === 'USD' ? '$' : 'MVR'
      amountPrefix.dataset.prefixCurrency = currency
    }
    rateRow.dataset.open = currency === 'MVR' ? 'true' : 'false'
    refresh()
  }

  /**
   * Choosing a method: the draft holds the one chosen, and every button is
   * repainted from it, so the one tapped is checked AND the one that was checked
   * before is not. Nothing else about the draft is touched, which is why
   * switching currency afterwards leaves the method exactly as it was.
   */
  const chooseMethod = (method: PaymentMethod): void => {
    draft = { ...draft, method }
    for (const button of methodButtons) {
      button.setAttribute('aria-checked', button.dataset.method === method ? 'true' : 'false')
    }
  }

  for (const button of methodButtons) {
    const method = button.dataset.method as PaymentMethod
    button.addEventListener('click', () => chooseMethod(method))
  }

  usdButton.addEventListener('click', () => chooseCurrency('USD'))
  mvrButton.addEventListener('click', () => chooseCurrency('MVR'))

  rateInput.addEventListener('input', () => {
    draft = { ...draft, rateText: rateInput.value }
    refresh()
  })
  amountInput.addEventListener('input', () => {
    draft = { ...draft, amountText: amountInput.value }
    refresh()
  })
  dateInput.addEventListener('input', () => {
    draft = { ...draft, entryDate: dateInput.value }
    refresh()
  })
  // The refined form carries no note field at all, so draft.note is never typed
  // into and every payment stores a null note.

  save.addEventListener('click', () => {
    const entry = receiveToNewEntry(draft)
    if (entry === null) return
    save.disabled = true
    // Where the button is now, which is where Home will grow from: it is read
    // before the save, while the form is still standing where it was tapped.
    const origin = centreOf(save)
    void handlers.onSave(entry, origin).then((outcome) => {
      if (outcome.outcome === 'retry') {
        // The form and every typed value stay exactly as they were.
        save.disabled = false
        saveMessage.textContent = outcome.message
        return
      }
      // The save went through: the button shows it was pressed and the form
      // dims where it stands, which is what the Home growing above it is read
      // over. The caller takes this screen out of the DOM when that grow ends.
      pressAndDim(screen, save)
    })
  })

  // USD is the currency the form opens in: this puts the pill under its half,
  // the dollar prefix on the amount and the rate row away.
  chooseCurrency('USD')
  // Cheque is the method the form opens on: this paints it as the one chosen,
  // and the other two as not.
  chooseMethod(draft.method)

  // The rows of the form, in the order they are read down it, which is the
  // order they rise in.
  const rows = [topRow, header, currencies, amountField, methodRow, dateGroup, foot]
  for (const row of rows) row.dataset.row = ''

  // The form opens as a circle growing from the button that was tapped, and its
  // rows rise in behind it; with reduced motion asked for neither runs and the
  // form opens whole, in the end state it is painted in above.
  if (state.origin) {
    revealFrom(screen, state.origin)
    enterRows(rows)
  }

  return screen
}
