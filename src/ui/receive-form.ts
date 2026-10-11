// The teal full-screen receive form. Its shape comes from the draft alone: a
// repayment is money back from Abbaas himself, so there is no person to choose
// and nothing to add. Every number it shows comes from the pure draft functions,
// so the preview the owner reads, the note that warns him and the row that is
// stored are the same arithmetic.
//
// The attribute contract this value fixes, and every later value keeps:
//   - the root carries data-form="receive"
//   - each quick-amount button carries data-quick
//   - the warning carries data-receive-note and is present ONLY when the payment
//     is at least what Abbaas holds
//   - the after-saving boxes carry data-preview-box="you"|"abbaas" with
//     data-state="filled"|"empty" and data-amount="<cents>", as on the send form
//   - the save button's accessible name starts with 'Save entry'
import { boxFor, type Balance } from '../domain/balance.js'
import { formatUsdCents } from '../domain/money.js'
import {
  amountTextForCents,
  balanceAfterReceive,
  canSaveReceive,
  emptyReceiveDraft,
  heldByAbbaas,
  receiveNoteFor,
  receiveToNewEntry,
  receiveUsdCents,
  type ReceiveDraft,
} from '../domain/receive-draft.js'
import type { AddEntryOutcome, NewEntry } from '../ports/ledger-store.js'
import { revealFrom, type Point } from './motion.js'

export type ReceiveFormHandlers = {
  /** Close without saving: the browser back button does the same thing. */
  readonly onClose: () => void
  readonly onSave: (entry: NewEntry) => Promise<AddEntryOutcome>
}

export type ReceiveFormState = {
  /** The balance before this payment; the preview subtracts the payment from it. */
  readonly balance: Balance
  /**
   * Where the Receive button was tapped, in viewport pixels: the form grows as
   * a circle from there (value 9). An arrival with no tap behind it - the back
   * or forward button, or a visit straight to #receive - has no point to grow
   * from and shows the form whole.
   */
  readonly origin?: Point | null
}

/** The line that says where the ledger stands before this payment. */
const balanceLine = (balance: Balance): string => {
  if (balance.holder === 'abbaas') return `Abbaas has ${formatUsdCents(balance.amountCents)} of yours`
  if (balance.holder === 'you') return `You have ${formatUsdCents(balance.amountCents)} of his`
  return 'All square'
}

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

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

const renderPreviewBox = (who: 'you' | 'abbaas'): HTMLElement => {
  const box = document.createElement('div')
  box.className = 'preview-box'
  box.dataset.previewBox = who

  const pill = document.createElement('span')
  pill.className = 'preview-pill'
  pill.textContent = who === 'you' ? 'You' : 'Abbaas'

  const amount = document.createElement('span')
  amount.className = 'preview-amount'
  amount.dataset.previewAmount = ''

  box.append(pill, amount)
  return box
}

/** Paints one preview box from the balance this payment would leave behind. */
const paintPreviewBox = (box: HTMLElement, after: Balance, who: 'you' | 'abbaas'): void => {
  const state = boxFor(after, who)
  box.dataset.state = state.state
  box.dataset.amount = String(state.amountCents)
  const amount = box.querySelector<HTMLElement>('[data-preview-amount]')
  // Never signed, here as on Home: a box that fills from the owner's side still
  // reads a plain amount.
  if (amount) amount.textContent = state.state === 'empty' ? '$0' : formatUsdCents(state.amountCents)
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
  const held = heldByAbbaas(state.balance)

  const screen = document.createElement('section')
  screen.dataset.form = 'receive'
  screen.className = 'screen receive-form'

  // ----- Header: Close, title, where the ledger stands now. -----
  const header = document.createElement('div')
  header.className = 'form-header'

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'form-close'
  close.setAttribute('aria-label', 'Close')
  close.textContent = '×'
  close.addEventListener('click', handlers.onClose)

  const title = document.createElement('h1')
  title.textContent = 'Payment from Abbaas'

  const standing = document.createElement('p')
  standing.className = 'form-standing'
  standing.textContent = balanceLine(state.balance)

  header.append(close, title, standing)
  screen.append(header)

  // ----- The currency switch: USD is chosen when the form opens. -----
  const currencies = document.createElement('div')
  currencies.className = 'currency-switch'
  const usdButton = currencyButton('USD', true)
  const mvrButton = currencyButton('MVR', false)
  currencies.append(usdButton, mvrButton)
  screen.append(currencies)

  // ----- Amount. -----
  const amountInput = textInput('text')
  amountInput.setAttribute('inputmode', 'decimal')
  amountInput.autocomplete = 'off'
  const amountField = labelled('Amount received', amountInput, 'receive-amount', '$')
  const amountPrefix = amountField.querySelector<HTMLElement>('[data-prefix]')
  screen.append(amountField)

  // ----- The rate and the dollar value it works out: MVR only. -----
  // Both live in this slot, which is empty while the currency is USD, so a USD
  // form has no 'Rate (MVR per $1)' label and no data-usd element to read at all.
  const rateSlot = document.createElement('div')
  rateSlot.className = 'rate-slot'
  screen.append(rateSlot)

  const rateInput = textInput('text')
  rateInput.setAttribute('inputmode', 'decimal')
  rateInput.autocomplete = 'off'
  const rateField = labelled('Rate (MVR per $1)', rateInput, 'receive-rate')

  const workedCard = document.createElement('div')
  workedCard.className = 'worked-card'

  const workedLabel = document.createElement('span')
  workedLabel.className = 'worked-label'
  workedLabel.textContent = 'That is'

  const workedValue = document.createElement('output')
  workedValue.className = 'worked-value'
  workedValue.dataset.usd = ''
  workedCard.append(workedLabel, workedValue)

  // ----- The quick amounts. -----
  const quick = document.createElement('div')
  quick.className = 'quick-amounts'
  screen.append(quick)

  // ----- The note: a slot that is empty whenever there is nothing to warn of. -----
  const noteSlot = document.createElement('div')
  noteSlot.className = 'receive-note-slot'
  screen.append(noteSlot)

  // ----- Date and note. -----
  const dateInput = textInput('date')
  dateInput.value = draft.entryDate
  screen.append(labelled('Date', dateInput, 'receive-date'))

  const noteInput = textInput('text')
  noteInput.autocomplete = 'off'
  screen.append(labelled('Note', noteInput, 'receive-note-text'))

  // ----- The after-saving preview. -----
  const preview = document.createElement('div')
  preview.className = 'preview'

  const previewLabel = document.createElement('p')
  previewLabel.className = 'group-label'
  previewLabel.textContent = 'After saving'

  const previewBoxes = document.createElement('div')
  previewBoxes.className = 'preview-boxes'
  const youPreview = renderPreviewBox('you')
  const abbaasPreview = renderPreviewBox('abbaas')
  previewBoxes.append(youPreview, abbaasPreview)

  preview.append(previewLabel, previewBoxes)
  screen.append(preview)

  // ----- Save. -----
  const save = document.createElement('button')
  save.type = 'button'
  save.className = 'save-button'

  const saveMessage = document.createElement('p')
  saveMessage.className = 'form-message'
  saveMessage.setAttribute('role', 'alert')

  screen.append(save, saveMessage)

  /**
   * Repaints everything derived from the draft: the preview boxes, the note, the
   * save button's name and whether it may be tapped. Called on every keystroke,
   * so what the owner reads is never one character behind.
   */
  const refresh = (): void => {
    const after = balanceAfterReceive(state.balance, draft)
    paintPreviewBox(youPreview, after, 'you')
    paintPreviewBox(abbaasPreview, after, 'abbaas')

    const cents = receiveUsdCents(draft)
    // The dollar value is what the balance moves by, in MVR as in USD, so the
    // button, the preview boxes and this output all read the same number.
    workedValue.textContent = formatUsdCents(cents)
    save.textContent = `Save entry · ${formatUsdCents(cents)}`
    // Refused until there is an amount; a receive names nobody, so that is all.
    save.disabled = !canSaveReceive(draft)

    const text = receiveNoteFor(state.balance, draft)
    if (text === null) {
      // Nothing to warn of, so there is no element to read at all.
      noteSlot.replaceChildren()
      return
    }
    const note = document.createElement('p')
    note.className = 'receive-note'
    note.dataset.receiveNote = ''
    note.setAttribute('role', 'status')
    note.textContent = text
    noteSlot.replaceChildren(note)
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
    if (amountPrefix) amountPrefix.textContent = currency === 'USD' ? '$' : 'MVR'
    if (currency === 'MVR') rateSlot.append(rateField, workedCard)
    else rateSlot.replaceChildren()
    refresh()
  }

  usdButton.addEventListener('click', () => chooseCurrency('USD'))
  mvrButton.addEventListener('click', () => chooseCurrency('MVR'))

  /**
   * A quick amount is a dollar figure, so taking one also returns the form to
   * dollars: the rate field goes away and the typed rufiyaa with it.
   */
  const takeQuick = (cents: number): void => {
    amountInput.value = amountTextForCents(cents)
    draft = { ...draft, amountText: amountInput.value, rateText: '' }
    rateInput.value = ''
    chooseCurrency('USD')
  }

  const addQuick = (label: string, cents: number): void => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'quick-button'
    button.dataset.quick = String(cents)
    button.textContent = label
    button.addEventListener('click', () => takeQuick(cents))
    quick.append(button)
  }

  // 'All of it' names what he holds right now, so it is offered only while he
  // holds something at all.
  if (held > 0) addQuick(`All of it · ${formatUsdCents(held)}`, held)
  addQuick(wholeDollars.format(500), 50000)
  addQuick(wholeDollars.format(1000), 100000)

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
  })
  noteInput.addEventListener('input', () => {
    draft = { ...draft, note: noteInput.value }
  })

  save.addEventListener('click', () => {
    const entry = receiveToNewEntry(draft)
    if (entry === null) return
    save.disabled = true
    void handlers.onSave(entry).then((outcome) => {
      if (outcome.outcome === 'retry') {
        // The form and every typed value stay exactly as they were.
        save.disabled = false
        saveMessage.textContent = outcome.message
      }
      // A saved payment leaves this screen; the caller decides what follows.
    })
  })

  refresh()

  // The form opens as a circle growing from the button that was tapped; with
  // reduced motion asked for, revealFrom does nothing and it opens whole.
  if (state.origin) revealFrom(screen, state.origin)

  return screen
}
