// The blue full-screen send form, as on the refined board. Its shape comes from
// the draft and the saved people; every number it shows comes from the pure
// draft functions, so the figure on the save button and the row that is stored
// are the same arithmetic.
//
// The attribute contract this value fixes, and every later value keeps:
//   - the root carries data-form="send"
//   - one button per saved person carries data-person-chip="<people.id>" and
//     aria-pressed, and contains that person's name
//   - the currency switch carries one data-pill element under the pressed half
//   - the amount's prefix carries data-prefix
//   - the save button's accessible name is 'Send · $X'
//   - in MVR, and only in MVR, the row under the amount offers the labelled
//     'Rate · MVR per $1' field and a data-usd output holding the dollars that
//     rate works the typed rufiyaa out to - the same figure the button names and
//     the same figure that is stored
//
// The refined board removed what version one showed here: there is no note
// field, and no after-saving preview, so no data-preview-box and no 'After
// saving' words exist on this form at all.
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
  canSaveDraft,
  dateChipWords,
  draftToNewEntry,
  draftUsdCents,
  emptySendDraft,
  todayIso,
  type SendDraft,
} from '../domain/send-draft.js'
import type {
  AddEntryOutcome,
  AddPersonOutcome,
  NewEntry,
  Person,
} from '../ports/ledger-store.js'
import { centreOf, enterRows, pressAndDim, revealFrom, type Point } from './motion.js'

export type SendFormHandlers = {
  /** Close without saving: the browser back button does the same thing. */
  readonly onClose: () => void
  readonly onAddPerson: (name: string) => Promise<AddPersonOutcome>
  /**
   * Stores the entry. The origin is the centre of the save button that was
   * tapped, in viewport pixels: the point Home grows from once the entry is
   * stored (value 9), measured here because only this screen knows where its
   * own button is.
   */
  readonly onSave: (entry: NewEntry, origin: Point) => Promise<AddEntryOutcome>
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

/**
 * The line that says where the ledger stands before this entry, as the pieces
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

/**
 * One of the board's line icons. Every icon is decoration beside words that
 * already say the same thing, so each is hidden from the accessible name: the
 * save button is named 'Send · $250.00' and not 'Send · $250.00 arrow'.
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

const TICK = ['M4 12.5 9.5 18 20 6.5']
const CLOSE = ['M6 6l12 12', 'M18 6 6 18']
const PLUS = ['M12 5v14', 'M5 12h14']
const ARROW_UP_RIGHT = ['M7 17 17 7', 'M8.5 7H17v8.5']
const CALENDAR = [
  'M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z',
  'M4 10h16',
  'M9 5V3',
  'M15 5V3',
]
const INFO = ['M12 11v5.5', 'M12 7.6v.2', 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z']

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

export const renderSendForm = (state: SendFormState, handlers: SendFormHandlers): HTMLElement => {
  // The draft is this screen's own value. It is replaced, never mutated, and
  // every answer about it comes from the pure functions in send-draft.ts.
  let draft: SendDraft = emptySendDraft()
  let people = byName(state.people)

  const screen = document.createElement('section')
  screen.dataset.form = 'send'
  screen.className = 'screen send-form'

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
  eyebrow.textContent = 'New entry · Send'

  const title = document.createElement('h1')
  title.textContent = 'Money sent for Abbaas'

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
  const amountField = labelled('Amount sent', amountInput, 'send-amount', '$')
  amountField.classList.add('amount-field')
  const amountPrefix = amountField.querySelector<HTMLElement>('[data-prefix]')
  screen.append(amountField)

  // ----- In USD nothing is converted, and the form says as much. -----
  // The line lives in a slot so that an MVR form, which does ask for a rate,
  // carries no such claim at all.
  const usdNoteSlot = document.createElement('div')
  usdNoteSlot.className = 'usd-note-slot'
  screen.append(usdNoteSlot)

  const usdNote = document.createElement('p')
  usdNote.className = 'usd-note'
  usdNote.append(icon(INFO, 16))
  const usdNoteText = document.createElement('span')
  usdNoteText.textContent = 'Dollars go straight onto the balance. No rate needed.'
  usdNote.append(usdNoteText)

  // ----- The rate and the dollar value it works out: MVR only. -----
  // One row of two equal cards: the rate the owner got on the left, and the
  // white card that reads the dollars it works out on the right. The row is
  // closed while the currency is USD - no height and nothing readable in it -
  // so a USD form offers neither the rate label nor the data-usd value, and it
  // opens by growing rather than by jumping into place.
  const rateRow = document.createElement('div')
  rateRow.className = 'rate-row'
  rateRow.dataset.open = 'false'
  screen.append(rateRow)

  const rateCard = document.createElement('div')
  rateCard.className = 'rate-card'

  const rateLabel = document.createElement('label')
  rateLabel.className = 'rate-label'
  rateLabel.htmlFor = 'send-rate'
  rateLabel.textContent = 'Rate · MVR per $1'

  const rateInput = textInput('text')
  rateInput.setAttribute('inputmode', 'decimal')
  rateInput.autocomplete = 'off'
  rateInput.classList.remove('field-input')
  rateInput.classList.add('rate-input')
  rateInput.id = 'send-rate'

  rateCard.append(rateLabel, rateInput)

  // The white card: what the owner is really sending, worked out as they type.
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

  // ----- Paid to: the saved people, and a way to type a new one. -----
  const paidTo = document.createElement('div')
  paidTo.className = 'paid-to'

  const paidToLabel = document.createElement('p')
  paidToLabel.className = 'group-label'
  paidToLabel.textContent = 'Paid to'

  const chips = document.createElement('div')
  chips.className = 'chips'

  // The New person chip is one of the row of chips, dashed to say that it makes
  // a chip rather than being one.
  const newPersonButton = document.createElement('button')
  newPersonButton.type = 'button'
  newPersonButton.className = 'new-person-button'
  newPersonButton.append(icon(PLUS, 16))
  const newPersonWord = document.createElement('span')
  newPersonWord.textContent = 'New person'
  newPersonButton.append(newPersonWord)

  const newPersonArea = document.createElement('div')
  newPersonArea.className = 'new-person'

  const personMessage = document.createElement('p')
  personMessage.className = 'form-message'
  personMessage.setAttribute('role', 'alert')

  chips.append(newPersonButton)
  paidTo.append(paidToLabel, chips, newPersonArea, personMessage)
  screen.append(paidTo)

  // ----- Date: one chip with the device's own picker lying over the whole of
  // it, so tapping anywhere on the chip opens the picker. -----
  const dateGroup = document.createElement('div')
  dateGroup.className = 'date-group'

  const dateChip = document.createElement('div')
  dateChip.className = 'date-chip'

  const dateIcon = icon(CALENDAR, 18)

  const dateWords = document.createElement('span')
  dateWords.className = 'date-words'

  const dateInput = textInput('date')
  dateInput.classList.remove('field-input')
  dateInput.classList.add('date-input')
  dateInput.id = 'send-date'
  dateInput.value = draft.entryDate

  dateChip.append(dateIcon, dateWords, dateInput)
  dateGroup.append(hiddenLabel('Date', 'send-date'), dateChip)
  screen.append(dateGroup)

  // ----- Save, at the bottom of the column. -----
  const save = document.createElement('button')
  save.type = 'button'
  save.className = 'save-button'

  const saveWord = document.createElement('span')
  saveWord.className = 'save-word'
  save.append(saveWord, icon(ARROW_UP_RIGHT, 18))

  const saveMessage = document.createElement('p')
  saveMessage.className = 'form-message'
  saveMessage.setAttribute('role', 'alert')

  const foot = document.createElement('div')
  foot.className = 'form-foot'
  foot.append(save, saveMessage)
  screen.append(foot)

  /**
   * Repaints everything derived from the draft: the preview boxes, the save
   * button's name and whether it may be tapped. Called on every keystroke, so
   * what the owner reads is never one character behind.
   */
  /** Set while the worked-out value's pop is running, so it can be restarted. */
  let popTimer: ReturnType<typeof setTimeout> | null = null

  const refresh = (): void => {
    const cents = draftUsdCents(draft)
    // The dollar value is what the balance moves by, in MVR as in USD, so the
    // button and this output read the same number.
    const worked = formatUsdCents(cents)
    if (workedValue.textContent !== worked) {
      workedValue.textContent = worked
      // The figure pops as it changes, so a value that moved cannot be missed.
      // With less motion asked for the stylesheet runs no animation at all, and
      // the figure simply reads as its new self.
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
    saveWord.textContent = `Send · ${formatUsdCents(cents)}`
    // Refused until there is an amount AND someone it was paid to.
    save.disabled = !canSaveDraft(draft)

    // The chip's words follow the picker, so the date is readable at a glance
    // without opening it: today says so by name, any other day is dated.
    dateWords.textContent = dateChipWords(draft.entryDate, todayIso())

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
    // The pill slides to the half that is now pressed.
    currencies.dataset.chosen = currency
    if (amountPrefix) {
      amountPrefix.textContent = currency === 'USD' ? '$' : 'MVR'
      amountPrefix.dataset.prefixCurrency = currency
    }
    if (currency === 'MVR') {
      rateRow.dataset.open = 'true'
      // Rufiyaa are converted, so the dollars-need-no-rate line would be false.
      usdNoteSlot.replaceChildren()
    } else {
      rateRow.dataset.open = 'false'
      usdNoteSlot.replaceChildren(usdNote)
    }
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

      // The tick is drawn in every chip but kept at no width until the chip is
      // the chosen one, which is what lets it slide in from nothing rather than
      // appear and shove the name sideways.
      const tick = document.createElement('span')
      tick.className = 'chip-tick'
      tick.setAttribute('aria-hidden', 'true')
      tick.append(icon(TICK, 16))

      const name = document.createElement('span')
      name.textContent = person.name

      chip.append(tick, name)
      chip.setAttribute('aria-pressed', 'false')
      chip.addEventListener('click', () => choose(person))
      chips.append(chip)
    }
    // The way to make a new chip stays at the end of the row it adds to.
    chips.append(newPersonButton)
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
    refresh()
  })
  // The refined form carries no note field at all, so draft.note is never
  // typed into and every send stores a null note.

  save.addEventListener('click', () => {
    const entry = draftToNewEntry(draft)
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

  paintChips()
  // USD is the currency the form opens in: this puts the pill under its half,
  // the dollar prefix on the amount and the no-rate line under it.
  chooseCurrency('USD')

  // The rows of the form, in the order they are read down it, which is the
  // order they rise in.
  const rows = [topRow, header, currencies, amountField, paidTo, dateGroup, foot]
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
