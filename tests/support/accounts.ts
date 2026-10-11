// Acceptance support: seeding is the test's job, not the app's. These helpers use
// the service-role key against the local stack to create confirmed accounts and to
// insert the fixed rows the oracle reads back, setting user_id explicitly because
// there is no auth.uid() on a service-role connection.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Stack } from './local-stack.js'

export type Account = { readonly email: string; readonly password: string; readonly userId: string }

export type SeededLedger = {
  readonly peopleIds: readonly string[]
  readonly entryIds: readonly string[]
}

/** The fixed facts the oracle asserts on. Account A owns all of them. */
export const ACCOUNT_A = { email: 'owner-a@abbaas.test', password: 'phone-a-password-1' } as const
export const ACCOUNT_B = { email: 'owner-b@abbaas.test', password: 'phone-b-password-2' } as const

export const A_PERSON_NAMES = ['Ahmed Shifaz', 'Mariyam Nisha'] as const
export const A_AMOUNT_TEXTS = ['$340.00', '$1,000.00', '$500.00'] as const
/** Every text that must appear for A and must never appear for B. */
export const A_PRIVATE_TEXTS = [...A_PERSON_NAMES, ...A_AMOUNT_TEXTS] as const

const admin = (stack: Stack): SupabaseClient =>
  createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

/** Creates an account whose email is already confirmed, so sign-in needs no mail. */
export const createAccount = async (
  stack: Stack,
  credentials: { readonly email: string; readonly password: string },
): Promise<Account> => {
  const { data, error } = await admin(stack).auth.admin.createUser({
    email: credentials.email,
    password: credentials.password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`Could not create ${credentials.email}: ${error?.message ?? 'no user returned'}`)
  }
  return { ...credentials, userId: data.user.id }
}

/** A stored entry row, as the oracle reads it back through the service role. */
export type StoredEntry = {
  readonly kind: string
  readonly currency: string
  readonly amount_minor: number
  readonly rate: string | null
  readonly usd_cents: number
  readonly entry_date: string
  readonly note: string | null
  readonly person_id: string | null
  readonly person_name: string | null
}

/**
 * Seeds one saved person and no entries, for the values that let the app itself do
 * the writing. Returns the person's id so the oracle can name its chip.
 */
export const seedPerson = async (
  stack: Stack,
  account: Account,
  name: string,
): Promise<string> => {
  const { data, error } = await admin(stack)
    .from('people')
    .insert({ user_id: account.userId, name })
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`Could not seed person ${name}: ${error?.message ?? 'no row returned'}`)
  }
  return data.id as string
}

/**
 * Seeds one USD send of the given cents to a named person, for the values that start
 * from a balance Abbaas already holds and let the app itself write the rest.
 * Returns the person's id.
 */
export const seedUsdSend = async (
  stack: Stack,
  account: Account,
  options: { readonly personName: string; readonly usdCents: number; readonly entryDate: string },
): Promise<string> => {
  const personId = await seedPerson(stack, account, options.personName)
  const { error } = await admin(stack)
    .from('entries')
    .insert({
      user_id: account.userId,
      kind: 'send',
      currency: 'USD',
      amount_minor: options.usdCents,
      rate: null,
      usd_cents: options.usdCents,
      entry_date: options.entryDate,
      person_id: personId,
      person_name: options.personName,
    })
  if (error) {
    throw new Error(`Could not seed the USD send: ${error.message}`)
  }
  return personId
}

/** One seeded entry, with its saved_at fixed so within-a-day order is decidable. */
export type EntrySeed = {
  readonly kind: 'send' | 'receive'
  readonly currency: 'USD' | 'MVR'
  readonly amountMinor: number
  readonly rate: string | null
  readonly usdCents: number
  readonly entryDate: string
  /** UTC instant, so the oracle and the database agree on which row is newer. */
  readonly savedAt: string
  readonly personName?: string
}

/**
 * Seeds the named people and the given entries in one go, each entry with an
 * explicit saved_at, for the values that read a history back rather than write it.
 * Entries are inserted in the order given; a send is linked to its named person.
 */
export const seedHistory = async (
  stack: Stack,
  account: Account,
  personNames: readonly string[],
  entries: readonly EntrySeed[],
): Promise<void> => {
  const client = admin(stack)

  const { data: people, error: peopleError } = await client
    .from('people')
    .insert(personNames.map((name) => ({ user_id: account.userId, name })))
    .select('id, name')
  if (peopleError || !people || people.length !== personNames.length) {
    throw new Error(`Could not seed people: ${peopleError?.message ?? 'unexpected row count'}`)
  }

  const idOf = (name: string): string => {
    const found = people.find((person) => person.name === name)
    if (!found) throw new Error(`Seeded person ${name} is missing`)
    return found.id as string
  }

  const { error: entriesError } = await client.from('entries').insert(
    entries.map((entry) => ({
      user_id: account.userId,
      kind: entry.kind,
      currency: entry.currency,
      amount_minor: entry.amountMinor,
      rate: entry.rate,
      usd_cents: entry.usdCents,
      entry_date: entry.entryDate,
      saved_at: entry.savedAt,
      person_id: entry.personName ? idOf(entry.personName) : null,
      person_name: entry.personName ?? null,
    })),
  )
  if (entriesError) {
    throw new Error(`Could not seed the history: ${entriesError.message}`)
  }
}

/**
 * Reads the account's entries back outside the browser, oldest first, so the oracle
 * can judge what the app actually stored and not only what it drew.
 */
export const readEntries = async (
  stack: Stack,
  account: Account,
): Promise<readonly StoredEntry[]> => {
  const { data, error } = await admin(stack)
    .from('entries')
    .select('kind, currency, amount_minor, rate, usd_cents, entry_date, note, person_id, person_name')
    .eq('user_id', account.userId)
    .order('saved_at', { ascending: true })
  if (error || !data) {
    throw new Error(`Could not read entries: ${error?.message ?? 'no rows returned'}`)
  }
  return data as readonly StoredEntry[]
}

/** Reads the account's people back outside the browser, so a new person is provably stored. */
export const readPeopleNames = async (
  stack: Stack,
  account: Account,
): Promise<readonly string[]> => {
  const { data, error } = await admin(stack)
    .from('people')
    .select('name')
    .eq('user_id', account.userId)
    .order('name', { ascending: true })
  if (error || !data) {
    throw new Error(`Could not read people: ${error?.message ?? 'no rows returned'}`)
  }
  return data.map((person) => person.name as string)
}

/**
 * Seeds exactly two people and three entries for the given account: a USD send, an
 * MVR send converted at a fixed rate, and a USD receive, which carries no person.
 */
export const seedLedger = async (stack: Stack, account: Account): Promise<SeededLedger> => {
  const client = admin(stack)

  const { data: people, error: peopleError } = await client
    .from('people')
    .insert([
      { user_id: account.userId, name: 'Ahmed Shifaz' },
      { user_id: account.userId, name: 'Mariyam Nisha' },
    ])
    .select('id, name')
  if (peopleError || !people || people.length !== 2) {
    throw new Error(`Could not seed people: ${peopleError?.message ?? 'unexpected row count'}`)
  }

  const idOf = (name: string): string => {
    const found = people.find((person) => person.name === name)
    if (!found) throw new Error(`Seeded person ${name} is missing`)
    return found.id as string
  }
  const ahmed = idOf('Ahmed Shifaz')
  const mariyam = idOf('Mariyam Nisha')

  const { data: entries, error: entriesError } = await client
    .from('entries')
    .insert([
      {
        user_id: account.userId,
        kind: 'send',
        currency: 'USD',
        amount_minor: 34000,
        rate: null,
        usd_cents: 34000,
        entry_date: '2026-10-08',
        person_id: mariyam,
        person_name: 'Mariyam Nisha',
      },
      {
        user_id: account.userId,
        kind: 'send',
        currency: 'MVR',
        amount_minor: 1540000,
        rate: '15.4000',
        usd_cents: 100000,
        entry_date: '2026-10-05',
        person_id: ahmed,
        person_name: 'Ahmed Shifaz',
      },
      {
        user_id: account.userId,
        kind: 'receive',
        currency: 'USD',
        amount_minor: 50000,
        rate: null,
        usd_cents: 50000,
        entry_date: '2026-09-29',
        person_id: null,
        person_name: null,
      },
    ])
    .select('id')
  if (entriesError || !entries || entries.length !== 3) {
    throw new Error(`Could not seed entries: ${entriesError?.message ?? 'unexpected row count'}`)
  }

  return {
    peopleIds: [ahmed, mariyam],
    entryIds: entries.map((entry) => entry.id as string),
  }
}
