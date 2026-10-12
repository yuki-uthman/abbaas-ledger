// The entry list as a pure projection of the account's entries: the day groups,
// newest day first, the order within a day, and the balance standing after each
// entry once the ledger is walked oldest first. No DOM, no Supabase: Home
// renders only what this module returns.
//
// The running balance follows the same rule as balance.ts, so the newest entry's
// after-balance is always the balance the boxes show: a send adds, a repayment
// subtracts, positive means Abbaas holds the owner's money.

import { formatUsdCents } from './money.js'

/** The part of an entry this projection depends on; a wider entry satisfies it. */
export type ViewEntry = {
  readonly id: string
  readonly kind: 'send' | 'receive'
  readonly usdCents: number
  /** YYYY-MM-DD: the day the money moved, which decides the group. */
  readonly entryDate: string
  /** The instant it was saved, which decides the order within a day. */
  readonly savedAt: string
}

/** Who holds money after one entry; 'none' exactly when that moment is square. */
export type AfterHolder = 'you' | 'abbaas' | 'none'

/** One entry in the list, with the standing it leaves behind it. */
export type ListedEntry<E extends ViewEntry> = {
  readonly entry: E
  /** Signed cents: positive when Abbaas holds, negative when the owner does. */
  readonly afterCents: number
  readonly afterHolder: AfterHolder
  /** 'Abbaas has $740.00', 'You have $260.00' or 'All square'. */
  readonly afterText: string
}

/** One day's worth of entries, newest saved first. */
export type DayGroup<E extends ViewEntry> = {
  /** YYYY-MM-DD, as the group's own attribute carries it. */
  readonly date: string
  /** 'Thu 8 Oct', or 'Today · Sun 11 Oct' for the device's today. */
  readonly label: string
  readonly isToday: boolean
  readonly entries: readonly ListedEntry<E>[]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * The date a device is on right now, as YYYY-MM-DD in its own zone. This is the
 * only impure reading the list needs, and it is kept to one named function so
 * the projection itself stays a function of its arguments.
 */
export const deviceToday = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

/**
 * A date as the owner reads it: weekday, day and short month in English, read
 * off the calendar date itself and never off a local instant, so the label can
 * never slide a day either side of midnight.
 */
const plainLabel = (date: string): string => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  // A date the store could not have stored is shown as it stands rather than
  // guessed at.
  if (!parts) return date
  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return date
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday} ${day} ${MONTHS[month - 1]}`
}

/** The label a day group reads; the device's today says so first. */
export const dayLabel = (date: string, today: string): string =>
  date === today ? `Today · ${plainLabel(date)}` : plainLabel(date)

/**
 * What the Entries count reads beside its heading: 'No entries' when the ledger
 * is empty, '1 entry' for a single one, and 'N entries' otherwise. Counted here
 * rather than in the DOM so the words are a function of the entries alone.
 */
export const entryCountLabel = (count: number): string => {
  if (count <= 0) return 'No entries'
  if (count === 1) return '1 entry'
  return `${count} entries`
}

/**
 * A formatted USD figure split at its decimal point, so the cents can be drawn
 * at half the size of the dollars while the figure still reads end to end.
 */
export const splitAmount = (formatted: string): { dollars: string; cents: string } => {
  const point = formatted.lastIndexOf('.')
  if (point < 0) return { dollars: formatted, cents: '' }
  return { dollars: formatted.slice(0, point), cents: formatted.slice(point) }
}

const holderOf = (afterCents: number): AfterHolder => {
  if (afterCents > 0) return 'abbaas'
  if (afterCents < 0) return 'you'
  return 'none'
}

/** Who holds what after an entry, unsigned, or that the moment is square. */
export const afterText = (afterCents: number): string => {
  const holder = holderOf(afterCents)
  if (holder === 'abbaas') return `Abbaas has ${formatUsdCents(afterCents)}`
  if (holder === 'you') return `You have ${formatUsdCents(afterCents)}`
  return 'All square'
}

/** Newest first: later day before earlier, then later saved before earlier. */
const newestFirst = <E extends ViewEntry>(left: E, right: E): number => {
  if (left.entryDate !== right.entryDate) return left.entryDate < right.entryDate ? 1 : -1
  if (left.savedAt !== right.savedAt) return left.savedAt < right.savedAt ? 1 : -1
  // Two rows saved at the very same instant still need one settled order.
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0
}

/**
 * The entries grouped into days, newest day first and newest saved first within
 * a day, each entry carrying the balance standing after it. The entries may
 * arrive in any order: the running balance is walked oldest first regardless, so
 * the newest entry's after-balance equals the whole ledger's balance.
 */
export const groupEntriesByDay = <E extends ViewEntry>(
  entries: readonly E[],
  today: string,
): readonly DayGroup<E>[] => {
  const ordered = [...entries].sort(newestFirst)

  // Walked oldest first, so each entry learns what it left behind it.
  let running = 0
  const afterById = new Map<string, number>()
  for (const entry of [...ordered].reverse()) {
    running += entry.kind === 'send' ? entry.usdCents : -entry.usdCents
    afterById.set(entry.id, running)
  }

  const groups: DayGroup<E>[] = []
  const byDate = new Map<string, ListedEntry<E>[]>()
  for (const entry of ordered) {
    const afterCents = afterById.get(entry.id) ?? 0
    const listed: ListedEntry<E> = {
      entry,
      afterCents,
      afterHolder: holderOf(afterCents),
      afterText: afterText(afterCents),
    }
    const existing = byDate.get(entry.entryDate)
    if (existing) {
      existing.push(listed)
      continue
    }
    const started: ListedEntry<E>[] = [listed]
    byDate.set(entry.entryDate, started)
    groups.push({
      date: entry.entryDate,
      label: dayLabel(entry.entryDate, today),
      isToday: entry.entryDate === today,
      entries: started,
    })
  }

  return groups
}
