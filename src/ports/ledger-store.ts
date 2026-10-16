// The LedgerStore port, in domain terms only: the signed-in account's entries,
// newest first, each carrying the person it names. This file knows nothing about
// Supabase, and nothing here mentions an account id: ownership is decided by the
// store, not by a filter the caller passes.

export type EntryKind = 'send' | 'receive'
export type Currency = 'USD' | 'MVR'

/**
 * How the money changed hands. These three words are the whole of it, and they
 * are the same three the database's own check constraint holds, so a method the
 * app can name is a method the store can keep.
 */
export type PaymentMethod = 'cash' | 'cheque' | 'transfer'

export type LedgerEntry = {
  readonly id: string
  readonly kind: EntryKind
  readonly currency: Currency
  /** US cents for USD, laari for MVR. */
  readonly amountMinor: number
  /** Rufiyaa per one US dollar; present exactly for MVR entries. */
  readonly rate: number | null
  readonly usdCents: number
  /** YYYY-MM-DD. */
  readonly entryDate: string
  readonly savedAt: string
  readonly note: string | null
  /** A send names a person; a repayment from Abbaas names nobody. */
  readonly personId: string | null
  readonly personName: string | null
  /**
   * How the money changed hands, or null for an entry stored before a method was
   * ever asked for: a null method is read as nothing said, never as a default.
   */
  readonly method: PaymentMethod | null
}

/** A person the owner has paid on Abbaas's behalf; typed once, chosen thereafter. */
export type Person = {
  readonly id: string
  readonly name: string
}

/**
 * An entry the app wants stored. There is deliberately no user_id here: the
 * column defaults to auth.uid() and row-level security decides ownership, so the
 * bundle never names an account.
 */
export type NewEntry = {
  readonly kind: EntryKind
  readonly currency: Currency
  readonly amountMinor: number
  readonly rate: number | null
  readonly usdCents: number
  /** YYYY-MM-DD. */
  readonly entryDate: string
  readonly note: string | null
  readonly personId: string | null
  readonly personName: string | null
  /**
   * The method the form chose. A form always chooses one, so this is null only
   * where no form asks yet; the column itself allows null for the rows stored
   * before it existed.
   */
  readonly method: PaymentMethod | null
}

export const LEDGER_UNREADABLE_MESSAGE = 'Could not load the ledger. Try again.'
export const ENTRY_UNSAVABLE_MESSAGE = 'Could not save. Try again.'
export const PERSON_UNSAVABLE_MESSAGE = 'Could not add this person. Try again.'
/**
 * What a removal that could not reach the store says. It is worded for the one
 * place a removal is asked for: the entry sheet's Delete, which keeps the sheet
 * open and the entry listed when it reads this.
 */
export const ENTRY_UNREMOVABLE_MESSAGE = 'Could not delete. Try again.'

/**
 * Reading the ledger. A Retry is distinct from an empty list on purpose: an empty
 * ledger and a failed read must never look alike.
 */
export type ReadEntriesOutcome =
  | { readonly outcome: 'read'; readonly entries: readonly LedgerEntry[] }
  | { readonly outcome: 'retry'; readonly message: string }

/** Reading the saved people, ordered by name. A Retry is not an empty list. */
export type ReadPeopleOutcome =
  | { readonly outcome: 'read'; readonly people: readonly Person[] }
  | { readonly outcome: 'retry'; readonly message: string }

/**
 * Adding a person. Adding a name that already exists for this account is not a
 * failure: the store answers with the person already saved under that name, so
 * the same name can never be stored twice.
 */
export type AddPersonOutcome =
  | { readonly outcome: 'added'; readonly person: Person }
  | { readonly outcome: 'retry'; readonly message: string }

/** Adding an entry. The id of the stored row comes back, for a later Undo. */
export type AddEntryOutcome =
  | { readonly outcome: 'added'; readonly id: string }
  | { readonly outcome: 'retry'; readonly message: string }

/**
 * Taking one stored entry back, which is what the sheet's Delete asks for.
 * 'removed' is claimed only when the row is really gone, so a delete that could
 * not reach the store answers Retry and the entry stays listed rather than being
 * hidden while it is still held.
 */
export type RemoveEntryOutcome =
  | { readonly outcome: 'removed' }
  | { readonly outcome: 'retry'; readonly message: string }

export type LedgerStore = {
  /** Newest entry_date first, then newest saved_at. */
  readonly readEntries: () => Promise<ReadEntriesOutcome>
  /** The account's people, ordered by name. */
  readonly listPeople: () => Promise<ReadPeopleOutcome>
  /** Stores a person, or answers with the one whose normalised name matches. */
  readonly addPerson: (name: string) => Promise<AddPersonOutcome>
  readonly addEntry: (entry: NewEntry) => Promise<AddEntryOutcome>
  /** Removes the one entry with this id; ownership is the store's to decide. */
  readonly removeEntry: (id: string) => Promise<RemoveEntryOutcome>
}
