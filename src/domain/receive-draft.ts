// The receive form's state as a plain value, and every question the form asks of
// it answered by a pure function: what it is worth in cents, whether it can be
// saved, the note it must show, the entry it becomes and the balance it would
// leave behind. No DOM and no Supabase, so the preview the owner reads, the note
// that warns him and the row that is stored are the same arithmetic.
//
// A receive is money back from Abbaas himself, so unlike a send it names no
// person: there is nothing to choose, and a positive amount is the whole
// condition for saving.
//
// The refined board's form shows no over-payment note, no quick amounts and no
// after-saving preview, so it asks none of receiveNoteFor, amountTextForCents or
// balanceAfterReceive: those remain the arithmetic of what a payment WOULD
// leave behind, which Home works out for itself from the stored rows.
//
// It also carries no note field, so draft.note is never typed into and every
// payment stores a null note.
import { balanceOf, type Balance } from './balance.js'
import {
  formatUsdCents,
  laariToUsdCents,
  parseMvrLaari,
  parseRateScaled,
  parseUsdCents,
  rateFromScaled,
} from './money.js'
import { todayIso } from './send-draft.js'
import type { Currency, NewEntry, PaymentMethod } from '../ports/ledger-store.js'

export type ReceiveDraft = {
  /** USD when the form opens; MVR adds the rate the owner got that day. */
  readonly currency: Currency
  readonly amountText: string
  /** The typed rate, rufiyaa per one US dollar; read only for MVR. */
  readonly rateText: string
  /** YYYY-MM-DD. */
  readonly entryDate: string
  readonly note: string
  /** How the money came back: one of the three is always chosen. */
  readonly method: PaymentMethod
}

export const emptyReceiveDraft = (today: string = todayIso()): ReceiveDraft => ({
  currency: 'USD',
  amountText: '',
  rateText: '',
  entryDate: today,
  note: '',
  // A repayment arrives by cheque more often than any other way, so that is the
  // one the form opens on; a tap moves it, and every opening starts here again.
  method: 'cheque',
})

/**
 * What this payment is worth in US cents, or 0 while the amount (or, for MVR,
 * the rate) is not yet one. The money rules are the send form's rules: a USD
 * amount's minor unit IS the cent, MVR laari are divided by the typed rate.
 */
export const receiveUsdCents = (draft: ReceiveDraft): number => {
  if (draft.currency === 'USD') return parseUsdCents(draft.amountText) ?? 0
  const laari = parseMvrLaari(draft.amountText)
  const rateScaled = parseRateScaled(draft.rateText)
  // A rate that does not parse claims no value at all, so nothing can be saved.
  if (laari === null || rateScaled === null) return 0
  return laariToUsdCents(laari, rateScaled)
}

/**
 * A payment is savable as soon as it is worth more than nothing, which in MVR
 * also means a rate has been typed: without one the rufiyaa are worth 0 dollars.
 */
export const canSaveReceive = (draft: ReceiveDraft): boolean => receiveUsdCents(draft) > 0

/**
 * What Abbaas currently holds of the owner's money, never signed and never
 * negative: when the balance has already moved to the owner's side he holds
 * nothing at all, so 'All of it' has nothing to offer.
 */
export const heldByAbbaas = (balance: Balance): number =>
  balance.balanceCents > 0 ? balance.balanceCents : 0

/**
 * The balance this payment would leave behind: the current totals with this
 * repayment added to what he has paid back. Built from the same projection Home
 * uses, so the preview and Home can never disagree — including when the sum
 * goes past what he holds and the balance lands on the owner's side.
 */
export const balanceAfterReceive = (current: Balance, draft: ReceiveDraft): Balance =>
  balanceOf([
    { kind: 'send', usdCents: current.sentCents },
    { kind: 'receive', usdCents: current.paidBackCents + receiveUsdCents(draft) },
  ])

/**
 * The note shown before saving, or null when there is nothing to say: a payment
 * smaller than he holds just lowers his box, and an amount not yet typed says
 * nothing at all.
 *
 * The difference D is the payment less what he holds, which is the whole
 * payment when he holds nothing.
 */
export const receiveNoteFor = (balance: Balance, draft: ReceiveDraft): string | null => {
  const cents = receiveUsdCents(draft)
  if (cents <= 0) return null
  const held = heldByAbbaas(balance)
  if (cents < held) return null
  if (cents === held) return 'This clears it. You will be all square.'
  const difference = formatUsdCents(cents - held)
  return `This is ${difference} more than he has of yours. The balance moves to your side: you will have ${difference} of his.`
}

/**
 * A cents figure as text for the amount field: plain digits and two decimals,
 * so a quick amount can be typed over and re-read by the same parser.
 */
export const amountTextForCents = (cents: number): string => (cents / 100).toFixed(2)

/** The entry this draft becomes, or null while it cannot be saved. */
export const receiveToNewEntry = (draft: ReceiveDraft): NewEntry | null => {
  const cents = receiveUsdCents(draft)
  if (cents <= 0) return null
  const note = draft.note.trim()
  // MVR keeps the rufiyaa figure in laari and the rate beside it; USD is held in
  // cents, where the minor unit and the dollar value agree.
  const laari = draft.currency === 'MVR' ? parseMvrLaari(draft.amountText) : null
  const rateScaled = draft.currency === 'MVR' ? parseRateScaled(draft.rateText) : null
  if (draft.currency === 'MVR' && (laari === null || rateScaled === null)) return null
  return {
    kind: 'receive',
    currency: draft.currency,
    amountMinor: laari ?? cents,
    // A rate belongs to an MVR entry only.
    rate: rateScaled === null ? null : rateFromScaled(rateScaled),
    usdCents: cents,
    entryDate: draft.entryDate,
    note: note === '' ? null : note,
    // A receive is money back from Abbaas himself: it names nobody.
    personId: null,
    personName: null,
    // The method the form had chosen when it was saved, which is why one payment
    // can be stored as cash and the next as transfer.
    method: draft.method,
  }
}
