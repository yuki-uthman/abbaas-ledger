// The blue full-screen send form. Its shape comes from the draft and the saved
// people; every number it shows comes from the pure draft functions, so the
// preview the owner reads and the row that is stored are the same arithmetic.
//
// The attribute contract this value fixes, and every later value keeps:
//   - the root carries data-form="send"
//   - one button per saved person carries data-person-chip="<people.id>" and
//     aria-pressed, its text being exactly that person's name
//   - the after-saving boxes carry data-preview-box="you"|"abbaas" with
//     data-state="filled"|"empty" and data-amount="<cents>"
//   - the save button's accessible name starts with 'Save entry'
import { boxFor, type Balance } from '../domain/balance.js'
import { formatUsdCents } from '../domain/money.js'
import {
  balanceAfterDraft,
  canSaveDraft,
  draftToNewEntry,
  draftUsdCents,
  emptySendDraft,
  type SendDraft,
} from '../domain/send-draft.js'
import type {
  AddEntryOutcome,
  AddPersonOutcome,
  NewEntry,
  Person,
} from '../ports/ledger-store.js'
import { revealFrom, type Point } from './motion.js'

export type SendFormHandlers = {
  /** Close without saving: the browser back button does the same thing. */
  readonly onClose: () => void
  readonly onAddPerson: (name: string) => Promise<AddPersonOutcome>
  readonly onSave: (entry: NewEntry) => Promise<AddEntryOutcome>
}

export type SendFormState = {
  readonly people: readonly Person[]
  /** The balance before this draft; the preview adds the draft to it. */
  readonly balance: Balance
  /**
   * Where the Send button was tapped, in viewport pixels: the form grows as a
   * circle from there (value 9). An arrival with no tap behind it - the back or
   * forward button, or a visit straight to #send - has no point to grow from
   * and shows the form whole.
   */
  readonly origin?: Point | null
}

/** The line that says where the ledger stands before this entry. */
const balanceLine = (balance: Balance): string => {
  if (balance.holder === 'abbaas') return `Abbaas has ${formatUsdCents(balance.amountCents)} of yours`
  if (balance.holder === 'you') return `You have ${formatUsdCents(balance.amountCents)} of his`
  return 'All square'
}

const byName = (people: readonly Person[]): readonly Person[] =>
  [...people].sort((left, right) => left.name.localeCompare(right.name))

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

/** Paints one preview box from the balance this draft would leave behind. */
const paintPreviewBox = (box: HTMLElement, after: Balance, who: 'you' | 'abbaas'): void => {
  const state = boxFor(after, who)
  box.dataset.state = state.state
  box.dataset.amount = String(state.amountCents)
  const amount = box.querySelector<HTMLElement>('[data-preview-amount]')
  // Never signed, here as on Home.
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

export const renderSendForm = (state: SendFormState, handlers: SendFormHandlers): HTMLElement => {
  // The draft is this screen's own value. It is replaced, never mutated, and
  // every answer about it comes from the pure functions in send-draft.ts.
  let draft: SendDraft = emptySendDraft()
  let people = byName(state.people)

  const screen = document.createElement('section')
  screen.dataset.form = 'send'
  screen.className = 'screen send-form'

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
  title.textContent = 'Money sent for Abbaas'

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
  const amountField = labelled('Amount sent', amountInput, 'send-amount', '$')
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
  const rateField = labelled('Rate (MVR per $1)', rateInput, 'send-rate')

  const workedCard = document.createElement('div')
  workedCard.className = 'worked-card'

  const workedLabel = document.createElement('span')
  workedLabel.className = 'worked-label'
  workedLabel.textContent = 'That is'

  const workedValue = document.createElement('output')
  workedValue.className = 'worked-value'
  workedValue.dataset.usd = ''
  workedCard.append(workedLabel, workedValue)

  // ----- Paid to: the saved people, and a way to type a new one. -----
  const paidTo = document.createElement('div')
  paidTo.className = 'paid-to'

  const paidToLabel = document.createElement('p')
  paidToLabel.className = 'group-label'
  paidToLabel.textContent = 'Paid to'

  const chips = document.createElement('div')
  chips.className = 'chips'

  const newPersonButton = document.createElement('button')
  newPersonButton.type = 'button'
  newPersonButton.className = 'new-person-button'
  newPersonButton.textContent = 'New person'

  const newPersonArea = document.createElement('div')
  newPersonArea.className = 'new-person'

  const personMessage = document.createElement('p')
  personMessage.className = 'form-message'
  personMessage.setAttribute('role', 'alert')

  paidTo.append(paidToLabel, chips, newPersonButton, newPersonArea, personMessage)
  screen.append(paidTo)

  // ----- Date and note. -----
  const dateInput = textInput('date')
  dateInput.value = draft.entryDate
  screen.append(labelled('Date', dateInput, 'send-date'))

  const noteInput = textInput('text')
  noteInput.autocomplete = 'off'
  screen.append(labelled('Note', noteInput, 'send-note'))

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
   * Repaints everything derived from the draft: the preview boxes, the save
   * button's name and whether it may be tapped. Called on every keystroke, so
   * what the owner reads is never one character behind.
   */
  const refresh = (): void => {
    const after = balanceAfterDraft(state.balance, draft)
    paintPreviewBox(youPreview, after, 'you')
    paintPreviewBox(abbaasPreview, after, 'abbaas')

    const cents = draftUsdCents(draft)
    // The dollar value is what the balance moves by, in MVR as in USD, so the
    // button, the preview boxes and this output all read the same number.
    workedValue.textContent = formatUsdCents(cents)
    save.textContent = `Save entry · ${formatUsdCents(cents)}`
    // Refused until there is an amount AND someone it was paid to.
    save.disabled = !canSaveDraft(draft)

    for (const chip of Array.from(chips.querySelectorAll<HTMLElement>('[data-person-chip]'))) {
      chip.setAttribute(
        'aria-pressed',
        draft.person !== null && chip.dataset.personChip === draft.person.id ? 'true' : 'false',
      )
    }
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

  rateInput.addEventListener('input', () => {
    draft = { ...draft, rateText: rateInput.value }
    refresh()
  })

  const choose = (person: Person): void => {
    draft = { ...draft, person }
    refresh()
  }

  const paintChips = (): void => {
    chips.replaceChildren()
    for (const person of people) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip'
      chip.dataset.personChip = person.id
      // The chip's whole text is the name and nothing else.
      chip.textContent = person.name
      chip.setAttribute('aria-pressed', 'false')
      chip.addEventListener('click', () => choose(person))
      chips.append(chip)
    }
    refresh()
  }

  // ----- Typing a person who has never been paid before. -----
  const openNewPerson = (): void => {
    if (newPersonArea.childElementCount > 0) return
    const nameInput = textInput('text')
    nameInput.autocomplete = 'off'

    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'add-person-button'
    add.textContent = 'Add'

    add.addEventListener('click', () => {
      const typed = nameInput.value.trim()
      if (typed === '') return
      add.disabled = true
      void handlers.onAddPerson(typed).then((outcome) => {
        add.disabled = false
        if (outcome.outcome === 'retry') {
          // The typed name is kept, so nothing has to be typed twice.
          personMessage.textContent = outcome.message
          return
        }
        personMessage.textContent = ''
        if (!people.some((person) => person.id === outcome.person.id)) {
          people = byName([...people, outcome.person])
        }
        paintChips()
        // Adding is also choosing: only the amount is left.
        choose(outcome.person)
        newPersonArea.replaceChildren()
      })
    })

    newPersonArea.append(labelled('Name', nameInput, 'new-person-name'), add)
    nameInput.focus()
  }

  newPersonButton.addEventListener('click', openNewPerson)

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
    const entry = draftToNewEntry(draft)
    if (entry === null) return
    save.disabled = true
    void handlers.onSave(entry).then((outcome) => {
      if (outcome.outcome === 'retry') {
        // The form and every typed value stay exactly as they were.
        save.disabled = false
        saveMessage.textContent = outcome.message
      }
      // A saved entry leaves this screen; the caller decides what follows.
    })
  })

  paintChips()

  // The form opens as a circle growing from the button that was tapped; with
  // reduced motion asked for, revealFrom does nothing and it opens whole.
  if (state.origin) revealFrom(screen, state.origin)

  return screen
}
