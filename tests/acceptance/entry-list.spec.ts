import { test, expect, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, seedHistory, type Account, type EntrySeed } from '../support/accounts.js'

// Value 6: the full entry list with day groups, the running balance and the totals.
//
// Judged through the declared public port only: the built bundle's DOM on Home,
// through the attribute contract of the earlier values (data-entry, data-person,
// data-box, data-amount) and this value's own (data-day, data-after, data-total).

const PASSWORD_FIELD = 'input[type="password"]'

const LIST_ACCOUNT = {
  email: 'owner-list@abbaas.test',
  password: 'list-password-6',
} as const

const MARIYAM = 'Mariyam Nisha'
const AHMED = 'Ahmed Shifaz'

// Six entries over five days, seeded oldest first with explicit saved_at times.
// Two of them share 2026-10-08, so within-a-day order is observable: the receive
// was saved at 18:00 and the send at 09:00, so the receive is listed first.
const SEEDED: readonly EntrySeed[] = [
  {
    kind: 'send',
    currency: 'MVR',
    amountMinor: 770000,
    rate: '15.4000',
    usdCents: 50000,
    entryDate: '2026-09-26',
    savedAt: '2026-09-26T10:00:00Z',
    personName: MARIYAM,
  },
  {
    kind: 'receive',
    currency: 'USD',
    amountMinor: 50000,
    rate: null,
    usdCents: 50000,
    entryDate: '2026-09-29',
    savedAt: '2026-09-29T10:00:00Z',
  },
  {
    kind: 'send',
    currency: 'MVR',
    amountMinor: 600000,
    rate: '15.0000',
    usdCents: 40000,
    entryDate: '2026-10-02',
    savedAt: '2026-10-02T10:00:00Z',
    personName: MARIYAM,
  },
  {
    kind: 'send',
    currency: 'MVR',
    amountMinor: 1540000,
    rate: '15.4000',
    usdCents: 100000,
    entryDate: '2026-10-05',
    savedAt: '2026-10-05T10:00:00Z',
    personName: AHMED,
  },
  {
    kind: 'send',
    currency: 'USD',
    amountMinor: 34000,
    rate: null,
    usdCents: 34000,
    entryDate: '2026-10-08',
    savedAt: '2026-10-08T09:00:00Z',
    personName: MARIYAM,
  },
  {
    kind: 'receive',
    currency: 'USD',
    amountMinor: 100000,
    rate: null,
    usdCents: 100000,
    entryDate: '2026-10-08',
    savedAt: '2026-10-08T18:00:00Z',
  },
]

// The days, newest first, with the label each one must read.
const DAYS: readonly (readonly [string, string])[] = [
  ['2026-10-08', 'Thu 8 Oct'],
  ['2026-10-05', 'Mon 5 Oct'],
  ['2026-10-02', 'Fri 2 Oct'],
  ['2026-09-29', 'Tue 29 Sep'],
  ['2026-09-26', 'Sat 26 Sep'],
]

// Every entry, newest first: the day it belongs to, the money and party it shows,
// and the balance standing after it once the ledger is walked oldest first.
// Chronologically: +50000, -50000 (square), +40000, +100000, +34000, -100000.
const ENTRIES: readonly {
  readonly day: string
  readonly amount: string
  readonly party: string
  readonly detail: string
  readonly after: string
  readonly afterText: string
}[] = [
  {
    day: '2026-10-08',
    amount: '$1,000.00',
    party: 'from Abbaas',
    detail: 'Paid in USD',
    after: '74000',
    afterText: 'Abbaas has $740.00',
  },
  {
    day: '2026-10-08',
    amount: '$340.00',
    party: MARIYAM,
    detail: 'Paid in USD',
    after: '174000',
    afterText: 'Abbaas has $1,740.00',
  },
  {
    day: '2026-10-05',
    amount: '$1,000.00',
    party: AHMED,
    detail: 'MVR 15,400 at 15.40',
    after: '140000',
    afterText: 'Abbaas has $1,400.00',
  },
  {
    day: '2026-10-02',
    amount: '$400.00',
    party: MARIYAM,
    detail: 'MVR 6,000 at 15.00',
    after: '40000',
    afterText: 'Abbaas has $400.00',
  },
  {
    day: '2026-09-29',
    amount: '$500.00',
    party: 'from Abbaas',
    detail: 'Paid in USD',
    after: '0',
    afterText: 'All square',
  },
  {
    day: '2026-09-26',
    amount: '$500.00',
    party: MARIYAM,
    detail: 'MVR 7,700 at 15.40',
    after: '50000',
    afterText: 'Abbaas has $500.00',
  },
]

let stack: Stack
let served: ServedOrigin
let account: Account

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, LIST_ACCOUNT)
  await seedHistory(stack, account, [AHMED, MARIYAM], SEEDED)
})

test.afterAll(async () => {
  await served?.close()
})

const signIn = async (page: Page): Promise<void> => {
  await page.goto(ORIGIN)
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
}

const squashed = (text: string): string => text.replace(/\s+/g, ' ').trim()

test('Home groups the entries by day, newest first, with the balance after each one and totals that match the boxes', async ({
  page,
}) => {
  await signIn(page)

  // ----- The day groups: one per date, newest date first, each labelled. -----
  const days = page.locator('[data-day]')
  await expect(days).toHaveCount(DAYS.length)
  expect(await days.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-day')))).toEqual(
    DAYS.map(([date]) => date),
  )
  for (const [date, label] of DAYS) {
    await expect(page.locator(`[data-day="${date}"]`)).toContainText(label)
  }
  // None of these days is the device's today, so none wears the Today mark.
  expect(squashed(await page.locator('[data-day]').first().innerText())).not.toContain('Today')

  // ----- The entries: newest day first, newest saved first within a day. -----
  const entries = page.locator('[data-entry]')
  await expect(entries).toHaveCount(ENTRIES.length)
  expect(await entries.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-after')))).toEqual(
    ENTRIES.map((entry) => entry.after),
  )

  for (const [index, expected] of ENTRIES.entries()) {
    const entry = entries.nth(index)
    const text = squashed(await entry.innerText())

    // What it shows: the USD amount, who it concerns, its currency detail, and
    // on the other side who holds what after it.
    expect(text, `entry ${index} amount`).toContain(expected.amount)
    expect(text, `entry ${index} party`).toContain(expected.party)
    expect(text, `entry ${index} detail`).toContain(expected.detail)

    // A send names its person; a receive comes from Abbaas himself and names none.
    const isSend = expected.party !== 'from Abbaas'
    await expect(entry.locator('[data-person]')).toHaveCount(isSend ? 1 : 0)

    // Each entry sits inside the group for its own date.
    await expect(
      page.locator(`[data-day="${expected.day}"] [data-entry][data-after="${expected.after}"]`),
    ).toHaveCount(1)

    // Who holds what after this entry is shown beside it, within its own day.
    expect(
      squashed(await page.locator(`[data-day="${expected.day}"]`).innerText()),
      `entry ${index} after text`,
    ).toContain(expected.afterText)
  }

  // The after-balances read down the list in the same newest-first order.
  const listText = squashed(
    (await page.locator('[data-day]').allInnerTexts()).join(' | '),
  )
  let cursor = 0
  for (const [index, expected] of ENTRIES.entries()) {
    const at = listText.indexOf(expected.afterText, cursor)
    expect(at, `after text ${index} in order: ${expected.afterText}`).toBeGreaterThanOrEqual(0)
    cursor = at + expected.afterText.length
  }

  // ----- The totals, and that their difference is the balance in the boxes. -----
  await expect(page.locator('[data-total="sent"]')).toHaveText('You sent $2,240.00')
  await expect(page.locator('[data-total="paid"]')).toHaveText('He paid back $1,500.00')

  const abbaasBox = page.locator('[data-box="abbaas"]')
  await expect(abbaasBox).toHaveAttribute('data-state', 'filled')
  await expect(abbaasBox).toHaveAttribute('data-amount', '74000')
  await expect(abbaasBox).toContainText('$740.00')
  await expect(page.locator('[data-box="you"]')).toHaveAttribute('data-amount', '0')
  await expect(page.locator('[data-square]')).toHaveCount(0)

  // 224000 sent less 150000 paid back is the 74000 the box claims, and the newest
  // entry's after-balance agrees with it.
  expect(224000 - 150000).toBe(74000)
  await expect(entries.first()).toHaveAttribute('data-after', '74000')

  // A read that fails is never drawn as a ledger: no groups, totals or entries.
  await expect(page.locator('[role="alert"]')).toHaveCount(0)
})
