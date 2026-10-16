// The send form's state as a plain value, and every question the form asks of
// it answered by a pure function: what it is worth in cents, whether it can be
// saved, the entry it becomes and the balance it would leave behind. No DOM and
// no Supabase, so the preview the owner sees and the row that is stored are
// worked out by the same code.
import { balanceOf, type Balance } from './balance.js'
import {
  laariToUsdCents,
  parseMvrLaari,
  parseRateScaled,
  parseUsdCents,
  rateFromScaled,
} from './money.js'
import type { Currency, NewEntry, PaymentMethod, Person } from '../ports/ledger-store.js'

export type SendDraft = {
  /** USD when the form opens; MVR adds the rate the owner got that day. */
  readonly currency: Currency
  readonly amountText: string
  /** The typed rate, rufiyaa per one US dollar; read only for MVR. */
  readonly rateText: string
  /** Null until the owner says who was paid; a send must name a person. */
  readonly person: Person | null
  /** YYYY-MM-DD. */
  readonly entryDate: string
  readonly note: string
  /**
   * How the money changed hands. A send always has one - the form opens on
   * Transfer - so unlike the person this is never null.
   */
  readonly method: PaymentMethod
}

/** Today in the device's own time zone, as the Date field must show it. */
export const todayIso = (now: Date = new Date()): string => {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * The words the board's date chip reads, so a day can be recognised without
 * opening the picker: today says so by name, and any other day is given its
 * weekday and date in the fixed en-GB shape 'Sat, 10 Oct'. Both carry the day
 * and the month, so the two never read as different kinds of thing.
 */
export const dateChipWords = (isoDate: string, today: string = todayIso()): string => {
  const parts = isoDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return isoDate
  // Built from the parts rather than parsed, so the day is read in the device's
  // own zone and never slips to the one before it.
  const day = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
  const month = day.toLocaleDateString('en-GB', { month: 'short' })
  const tail = `${day.getDate()} ${month}`
  if (isoDate === today) return `Today, ${tail}`
  return `${day.toLocaleDateString('en-GB', { weekday: 'short' })}, ${tail}`
}

export const emptySendDraft = (today: string = todayIso()): SendDraft => ({
  currency: 'USD',
  amountText: '',
  rateText: '',
  person: null,
  entryDate: today,
  note: '',
  // Transfer is how most of this money moves, so it is what a fresh form opens
  // on; every opening starts here again, remembering no earlier choice.
  method: 'transfer',
})

/**
 * What this draft is worth in US cents, or 0 while the amount (or, for MVR, the
 * rate) is not yet one. For a USD send the minor unit IS the cent, so one
 * number serves both; for MVR the laari are divided by the typed rate.
 */
export const draftUsdCents = (draft: SendDraft): number => {
  if (draft.currency === 'USD') return parseUsdCents(draft.amountText) ?? 0
  const laari = parseMvrLaari(draft.amountText)
  const rateScaled = parseRateScaled(draft.rateText)
  // A rate that does not parse claims no value at all, so nothing can be saved.
  if (laari === null || rateScaled === null) return 0
  return laariToUsdCents(laari, rateScaled)
}

/** A draft is savable only with a positive amount and a named person. */
export const canSaveDraft = (draft: SendDraft): boolean =>
  draftUsdCents(draft) > 0 && draft.person !== null

/**
 * The balance this draft would leave behind: the current totals with this send
 * added. Built from the same projection Home uses, so the preview and Home can
 * never disagree.
 */
export const balanceAfterDraft = (current: Balance, draft: SendDraft): Balance =>
  balanceOf([
    { kind: 'send', usdCents: current.sentCents + draftUsdCents(draft) },
    { kind: 'receive', usdCents: current.paidBackCents },
  ])

/** The entry this draft becomes, or null while it cannot be saved. */
export const draftToNewEntry = (draft: SendDraft): NewEntry | null => {
  const cents = draftUsdCents(draft)
  const person = draft.person
  if (cents <= 0 || person === null) return null
  const note = draft.note.trim()
  // MVR keeps the rufiyaa figure in laari and the rate beside it; USD is held in
  // cents, where the minor unit and the dollar value agree.
  const laari = draft.currency === 'MVR' ? parseMvrLaari(draft.amountText) : null
  const rateScaled = draft.currency === 'MVR' ? parseRateScaled(draft.rateText) : null
  if (draft.currency === 'MVR' && (laari === null || rateScaled === null)) return null
  return {
    kind: 'send',
    currency: draft.currency,
    amountMinor: laari ?? cents,
    // A rate belongs to an MVR entry only.
    rate: rateScaled === null ? null : rateFromScaled(rateScaled),
    usdCents: cents,
    entryDate: draft.entryDate,
    note: note === '' ? null : note,
    personId: person.id,
    personName: person.name,
    // Whatever the Method row is showing is what is stored, untouched default
    // and tapped choice alike.
    method: draft.method,
  }
}
