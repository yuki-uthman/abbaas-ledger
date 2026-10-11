// LedgerStore over PostgREST. Note what is NOT here: no user_id in the select and
// no eq('user_id', ...) anywhere. Row-level security alone decides which rows come
// back, so if a select policy were dropped the acceptance run would show another
// account's rows and fail, instead of a client-side filter hiding the leak.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ENTRY_UNREMOVABLE_MESSAGE,
  ENTRY_UNSAVABLE_MESSAGE,
  LEDGER_UNREADABLE_MESSAGE,
  PERSON_UNSAVABLE_MESSAGE,
  type AddEntryOutcome,
  type AddPersonOutcome,
  type Currency,
  type EntryKind,
  type LedgerEntry,
  type LedgerStore,
  type NewEntry,
  type Person,
  type ReadEntriesOutcome,
  type ReadPeopleOutcome,
  type RemoveEntryOutcome,
} from '../../ports/ledger-store.js'

/** The person an entry names travels on the entry itself: its id and its name. */
const COLUMNS =
  'id, kind, currency, amount_minor, rate, usd_cents, entry_date, saved_at, note, person_id, person_name'

type EntryRow = {
  id: string
  kind: string
  currency: string
  amount_minor: number | string
  rate: number | string | null
  usd_cents: number | string
  entry_date: string
  saved_at: string
  note: string | null
  person_id: string | null
  person_name: string | null
}

/** bigint and numeric arrive as strings from PostgREST when they are large. */
const asNumber = (value: number | string): number =>
  typeof value === 'number' ? value : Number(value)

const toEntry = (row: EntryRow): LedgerEntry => ({
  id: row.id,
  kind: row.kind as EntryKind,
  currency: row.currency as Currency,
  amountMinor: asNumber(row.amount_minor),
  rate: row.rate === null ? null : asNumber(row.rate),
  usdCents: asNumber(row.usd_cents),
  entryDate: row.entry_date,
  savedAt: row.saved_at,
  note: row.note,
  personId: row.person_id,
  personName: row.person_name,
})

type PersonRow = { id: string; name: string }

const toPerson = (row: PersonRow): Person => ({ id: row.id, name: row.name })

/**
 * The same normalisation the people.name_key generated column applies: trimmed,
 * inner runs of whitespace collapsed, lower-cased. Computed here only to FIND
 * the row a unique-violation refers to, never to decide uniqueness: Postgres
 * does that.
 */
const nameKeyOf = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase()

/** The row an insert sends: every column except user_id, which defaults to auth.uid(). */
const toEntryRow = (entry: NewEntry): Record<string, unknown> => ({
  kind: entry.kind,
  currency: entry.currency,
  amount_minor: entry.amountMinor,
  rate: entry.rate,
  usd_cents: entry.usdCents,
  entry_date: entry.entryDate,
  note: entry.note,
  person_id: entry.personId,
  person_name: entry.personName,
})

export const createSupabaseLedgerStore = (client: SupabaseClient): LedgerStore => ({
  readEntries: async (): Promise<ReadEntriesOutcome> => {
    try {
      const { data, error } = await client
        .from('entries')
        .select(COLUMNS)
        .order('entry_date', { ascending: false })
        .order('saved_at', { ascending: false })
      if (error || !data) {
        return { outcome: 'retry', message: LEDGER_UNREADABLE_MESSAGE }
      }
      return { outcome: 'read', entries: (data as unknown as EntryRow[]).map(toEntry) }
    } catch {
      // An unreachable origin throws rather than answering.
      return { outcome: 'retry', message: LEDGER_UNREADABLE_MESSAGE }
    }
  },

  listPeople: async (): Promise<ReadPeopleOutcome> => {
    try {
      // No user_id filter here either: the select policy decides.
      const { data, error } = await client
        .from('people')
        .select('id, name')
        .order('name', { ascending: true })
      if (error || !data) return { outcome: 'retry', message: LEDGER_UNREADABLE_MESSAGE }
      return { outcome: 'read', people: (data as PersonRow[]).map(toPerson) }
    } catch {
      return { outcome: 'retry', message: LEDGER_UNREADABLE_MESSAGE }
    }
  },

  addPerson: async (name: string): Promise<AddPersonOutcome> => {
    const trimmed = name.trim()
    if (trimmed === '') return { outcome: 'retry', message: PERSON_UNSAVABLE_MESSAGE }
    try {
      const inserted = await client
        .from('people')
        .insert({ name: trimmed })
        .select('id, name')
        .single()
      if (!inserted.error && inserted.data) {
        return { outcome: 'added', person: toPerson(inserted.data as PersonRow) }
      }

      // A name this account already holds is refused by the unique (user_id,
      // name_key) index. That is not a failure to report: the person exists, so
      // the owner meant to choose them.
      const existing = await client
        .from('people')
        .select('id, name')
        .eq('name_key', nameKeyOf(trimmed))
        .maybeSingle()
      if (!existing.error && existing.data) {
        return { outcome: 'added', person: toPerson(existing.data as PersonRow) }
      }
      return { outcome: 'retry', message: PERSON_UNSAVABLE_MESSAGE }
    } catch {
      return { outcome: 'retry', message: PERSON_UNSAVABLE_MESSAGE }
    }
  },

  addEntry: async (entry: NewEntry): Promise<AddEntryOutcome> => {
    try {
      const { data, error } = await client
        .from('entries')
        .insert(toEntryRow(entry))
        .select('id')
        .single()
      if (error || !data) return { outcome: 'retry', message: ENTRY_UNSAVABLE_MESSAGE }
      return { outcome: 'added', id: (data as { id: string }).id }
    } catch {
      return { outcome: 'retry', message: ENTRY_UNSAVABLE_MESSAGE }
    }
  },

  removeEntry: async (id: string): Promise<RemoveEntryOutcome> => {
    try {
      // No user_id filter: the delete policy decides whose row this is, so
      // another account's id deletes nothing rather than being hidden.
      // The returning select is what proves the row is really gone: a delete
      // that matched nothing comes back empty and is reported as a Retry,
      // never as an Undo that silently left the entry stored.
      const { data, error } = await client.from('entries').delete().eq('id', id).select('id')
      if (error || !data || data.length === 0) {
        return { outcome: 'retry', message: ENTRY_UNREMOVABLE_MESSAGE }
      }
      return { outcome: 'removed' }
    } catch {
      // An unreachable origin throws rather than answering.
      return { outcome: 'retry', message: ENTRY_UNREMOVABLE_MESSAGE }
    }
  },
})
