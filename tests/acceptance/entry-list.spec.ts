import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, seedHistory, type Account, type EntrySeed } from '../support/accounts.js'

// Refined board value 1: Home as on the refined board.
//
// Judged through the declared public port only: the built bundle's DOM on Home,
// through the attribute contract in force (data-box with data-state and
// data-amount, data-square, data-total, data-day, data-entry, data-person,
// data-after) and this value's own additions (data-count, data-cents, data-fade).
//
// This replaces version one's entry-list oracle at the same path: sends now lie
// LEFT of the centre line and payments right of it.

const PASSWORD_FIELD = 'input[type="password"]'

const LIST_ACCOUNT = {
  email: 'owner-board@abbaas.test',
  password: 'board-password-1',
} as const

const MARIYAM = 'Mariyam Nisha'
const AHMED = 'Ahmed Shifaz'

// ----- The three days, named relative to the device's own today, so the Today
// ----- label is exercised by the clock the app reads and not by a frozen date.
const dayOffset = (back: number): string => {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - back)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const TODAY = dayOffset(0)
const MIDDLE_DAY = dayOffset(2)
const EARLIEST_DAY = dayOffset(4)

/** 'Thu 8 Oct' for a date, as the day pill spells it before CSS uppercases it. */
const dayLabel = (isoDate: string): string => {
  const date = new Date(`${isoDate}T12:00:00`)
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(date)
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}`
}

// Seeded oldest first with explicit saved_at times. The MVR send and the payment
// share MIDDLE_DAY, so within-a-day order is observable: the payment was saved at
// 18:00 and the send at 09:00, so the payment is listed first.
const SEEDED: readonly EntrySeed[] = [
  {
    kind: 'send',
    currency: 'USD',
    amountMinor: 25000,
    rate: null,
    usdCents: 25000,
    entryDate: EARLIEST_DAY,
    savedAt: `${EARLIEST_DAY}T09:00:00Z`,
    personName: MARIYAM,
  },
  {
    kind: 'send',
    currency: 'MVR',
    amountMinor: 1000000,
    rate: '20.0000',
    usdCents: 50000,
    entryDate: MIDDLE_DAY,
    savedAt: `${MIDDLE_DAY}T09:00:00Z`,
    personName: AHMED,
  },
  {
    kind: 'receive',
    currency: 'USD',
    amountMinor: 30000,
    rate: null,
    usdCents: 30000,
    entryDate: MIDDLE_DAY,
    savedAt: `${MIDDLE_DAY}T18:00:00Z`,
  },
  {
    kind: 'send',
    currency: 'USD',
    amountMinor: 34000,
    rate: null,
    usdCents: 34000,
    entryDate: TODAY,
    savedAt: `${TODAY}T09:00:00Z`,
    personName: AHMED,
  },
]

// The days, newest first.
const DAYS: readonly string[] = [TODAY, MIDDLE_DAY, EARLIEST_DAY]

// Every entry, newest first. Chronologically the balance walks
// +25000, +50000, -30000, +34000, so it ends at 79000.
const SEND_TINT = 'rgba(36, 80, 138, 0.1)'
const PAYMENT_TINT = 'rgba(15, 111, 104, 0.11)'

const ENTRIES: readonly {
  readonly day: string
  readonly kind: 'send' | 'payment'
  readonly amount: string
  readonly party: string
  readonly detail: string
  readonly after: string
  readonly afterText: string
  readonly tint: string
}[] = [
  {
    day: TODAY,
    kind: 'send',
    amount: '$340.00',
    party: AHMED,
    detail: 'Paid in USD',
    after: '79000',
    afterText: 'Abbaas has $790.00',
    tint: SEND_TINT,
  },
  {
    day: MIDDLE_DAY,
    kind: 'payment',
    amount: '$300.00',
    party: 'from Abbaas',
    detail: 'Paid in USD',
    after: '45000',
    afterText: 'Abbaas has $450.00',
    tint: PAYMENT_TINT,
  },
  {
    day: MIDDLE_DAY,
    kind: 'send',
    amount: '$500.00',
    party: AHMED,
    detail: 'MVR 10,000 at 20.00',
    after: '75000',
    afterText: 'Abbaas has $750.00',
    tint: SEND_TINT,
  },
  {
    day: EARLIEST_DAY,
    kind: 'send',
    amount: '$250.00',
    party: MARIYAM,
    detail: 'Paid in USD',
    after: '25000',
    afterText: 'Abbaas has $250.00',
    tint: SEND_TINT,
  },
]

let stack: Stack
let served: ServedOrigin
let account: Account

test.describe.configure({ mode: 'serial' })

// The refined board is read at a 390 by 844 phone.
test.use({ viewport: { width: 390, height: 844 } })

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

/**
 * Home's entrance animates: the root carries data-motion while the boxes rise,
 * the balance counts up from $0 and each entry slides in from its side. Every
 * geometry, text and style reading below is of the board at rest, so each one is
 * taken only once nothing on the page still carries data-motion. No expected
 * value is relaxed: the oracle waits instead of widening.
 */
const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-motion]')).toHaveCount(0)
}

const boxOf = async (locator: Locator, what: string) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${what} has no box on screen`)
  return box
}

const styleOf = (locator: Locator, property: string): Promise<string> =>
  locator.evaluate(
    (node, prop) => getComputedStyle(node as Element).getPropertyValue(prop),
    property,
  )

test('Home is the refined board: no title, boxes on top, an Entries count, sends left of the line, payments right, and a fade above the buttons', async ({
  page,
}) => {
  await signIn(page)
  // The board has just entered: read it only once its entrance has finished.
  await settled(page)

  const viewport = page.viewportSize()
  if (!viewport) throw new Error('The run has no viewport')
  const centre = viewport.width / 2

  const youBox = page.locator('[data-box="you"]')
  const abbaasBox = page.locator('[data-box="abbaas"]')
  await expect(youBox).toBeVisible()
  await expect(abbaasBox).toBeVisible()

  // ----- No title, and nothing headed above the boxes. -----
  await expect(page.getByText('Abbaas Ledger')).toHaveCount(0)
  const youGeometry = await boxOf(youBox, 'the you box')
  expect(youGeometry.y, 'the box row starts just below the top of the screen').toBeGreaterThanOrEqual(24)
  expect(youGeometry.y).toBeLessThanOrEqual(64)

  const headingTops = await page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => node.getBoundingClientRect().top),
    )
  for (const top of headingTops) {
    expect(top, 'no heading stands above the boxes').toBeGreaterThanOrEqual(youGeometry.y)
  }

  // ----- The boxes: the holder filled, the pill in the outer top corner, the
  // ----- amount on the outer edge with its cents at half size. -----
  await expect(abbaasBox).toHaveAttribute('data-state', 'filled')
  await expect(abbaasBox).toHaveAttribute('data-amount', '79000')
  expect(squashed(await abbaasBox.innerText()), "the box reads its amount end to end").toContain(
    '$790.00',
  )
  await expect(abbaasBox).toContainText('has your money')
  await expect(youBox).toHaveAttribute('data-state', 'empty')
  await expect(youBox).toHaveAttribute('data-amount', '0')
  await expect(youBox).toContainText('nothing of his')
  await expect(page.locator('[data-square]')).toHaveCount(0)

  const abbaasGeometry = await boxOf(abbaasBox, 'the abbaas box')
  expect(abbaasGeometry.height, 'the boxes are at least 136 px tall').toBeGreaterThanOrEqual(136)
  expect(youGeometry.height).toBeGreaterThanOrEqual(136)
  expect(youGeometry.x + youGeometry.width, 'the You box is the left one').toBeLessThanOrEqual(
    abbaasGeometry.x + 1,
  )

  const abbaasPill = abbaasBox.getByText('Abbaas', { exact: true })
  const youPill = youBox.getByText('You', { exact: true })
  const abbaasPillBox = await boxOf(abbaasPill, "Abbaas's pill")
  const youPillBox = await boxOf(youPill, "the owner's pill")
  // Abbaas's pill sits in its box's top-right quarter, the owner's in its top-left.
  expect(abbaasPillBox.x + abbaasPillBox.width / 2).toBeGreaterThan(
    abbaasGeometry.x + abbaasGeometry.width / 2,
  )
  expect(abbaasPillBox.y + abbaasPillBox.height / 2).toBeLessThan(
    abbaasGeometry.y + abbaasGeometry.height / 2,
  )
  expect(youPillBox.x + youPillBox.width / 2).toBeLessThan(youGeometry.x + youGeometry.width / 2)
  expect(youPillBox.y + youPillBox.height / 2).toBeLessThan(youGeometry.y + youGeometry.height / 2)

  // The filled amount lies on the box's outer edge, and its cents are half size.
  const cents = abbaasBox.locator('[data-cents]')
  await expect(cents).toHaveCount(1)
  await expect(cents).toHaveText('.00')
  const centsBox = await boxOf(cents, "the amount's cents")
  expect(
    abbaasGeometry.x + abbaasGeometry.width - (centsBox.x + centsBox.width),
    'the amount ends on the box’s outer edge, not centred',
  ).toBeLessThanOrEqual(20)

  const sizes = await cents.evaluate((node) => {
    const parent = (node as HTMLElement).parentElement
    if (!parent) throw new Error('The cents span has no amount around it')
    return {
      cents: parseFloat(getComputedStyle(node as Element).fontSize),
      amount: parseFloat(getComputedStyle(parent).fontSize),
    }
  })
  expect(sizes.amount, 'the filled amount is 34 px').toBeCloseTo(34, 0)
  expect(sizes.cents, 'its cents are half that').toBeCloseTo(sizes.amount / 2, 0)

  // ----- The totals, and the Entries heading with its count. -----
  await expect(page.locator('[data-total="sent"]')).toHaveText('You sent $1,090.00')
  await expect(page.locator('[data-total="paid"]')).toHaveText('He paid back $300.00')
  expect(109000 - 30000, 'the totals differ by the balance in the box').toBe(79000)

  const entriesHeading = page.getByRole('heading', { level: 2, name: 'Entries' })
  await expect(entriesHeading).toBeVisible()
  const count = page.locator('[data-count]')
  await expect(count).toHaveText('4 entries')
  const headingBox = await boxOf(entriesHeading, 'the Entries heading')
  const countBox = await boxOf(count, 'the count')
  expect(headingBox.x, 'the heading is left of the count on one row').toBeLessThan(countBox.x)
  expect(headingBox.y, 'the Entries heading sits under the boxes').toBeGreaterThanOrEqual(
    abbaasGeometry.y + abbaasGeometry.height - 1,
  )

  // ----- The day pills: newest date first, uppercase, today marked. -----
  const days = page.locator('[data-day]')
  await expect(days).toHaveCount(DAYS.length)
  expect(
    await days.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-day'))),
  ).toEqual([...DAYS])

  // data-day is on the whole day group, whose text includes its entries, so each
  // reading below is of the label pill alone: the element inside the group whose
  // text begins with the day name.
  const dayPill = (date: string): Locator =>
    page
      .locator(`[data-day="${date}"]`)
      .getByText(/^\s*(today|mon|tue|wed|thu|fri|sat|sun)/i)
      .first()

  for (const date of DAYS) {
    const pill = dayPill(date)
    await expect(pill).toHaveCount(1)
    const label = squashed(await pill.innerText())
    expect(label, `the ${date} pill reads in uppercase`).toBe(label.toUpperCase())
    expect(label, `the ${date} pill names its date`).toContain(dayLabel(date).toUpperCase())
  }
  expect(
    squashed(await dayPill(TODAY).innerText()),
    "today's pill is marked Today",
  ).toContain('TODAY')
  expect(
    squashed(await dayPill(EARLIEST_DAY).innerText()),
    'an older day is not marked Today',
  ).not.toContain('TODAY')

  // ----- The entries: tinted cards, sends left of the line, payments right, with
  // ----- the after-balance on the other side. -----
  const entries = page.locator('[data-entry]')
  await expect(entries).toHaveCount(ENTRIES.length)

  // The after-balances read down the list in the same newest-first order; they
  // carry data-after and sit beside their card, not on it.
  const afters = page.locator('[data-after]')
  await expect(afters).toHaveCount(ENTRIES.length)
  expect(
    await afters.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-after'))),
  ).toEqual(ENTRIES.map((entry) => entry.after))
  expect(
    (await afters.allInnerTexts()).map((text) => squashed(text)),
  ).toEqual(ENTRIES.map((entry) => entry.afterText))

  for (const [index, expected] of ENTRIES.entries()) {
    const card = entries.nth(index)
    const text = squashed(await card.innerText())
    expect(text, `entry ${index} amount`).toContain(expected.amount)
    expect(text, `entry ${index} party`).toContain(expected.party)
    expect(text, `entry ${index} detail`).toContain(expected.detail)

    // A send names the person it was paid to; a payment comes from Abbaas himself.
    const isSend = expected.kind === 'send'
    await expect(card.locator('[data-person]')).toHaveCount(isSend ? 1 : 0)
    if (isSend) {
      await expect(card.locator('[data-person]')).toHaveText(expected.party)
    }

    // data-entry is on the card, and the card is tinted for its kind.
    expect(
      await styleOf(card, 'background-color'),
      `entry ${index} card tint`,
    ).toBe(expected.tint)

    // Each card lies wholly on its own half of the list.
    const cardBox = await boxOf(card, `entry ${index} card`)
    if (isSend) {
      expect(cardBox.x + cardBox.width, `send ${index} lies wholly left of the line`).toBeLessThanOrEqual(
        centre,
      )
    } else {
      expect(cardBox.x, `payment ${index} lies wholly right of the line`).toBeGreaterThanOrEqual(centre)
    }

    // Its after-balance sits in the same row, on the opposite half.
    const afterText = afters.nth(index)
    expect(squashed(await afterText.innerText()), `entry ${index} after text`).toBe(
      expected.afterText,
    )
    const afterBox = await boxOf(afterText, `entry ${index} after text`)
    if (isSend) {
      expect(afterBox.x, `send ${index} shows its balance right of the line`).toBeGreaterThanOrEqual(
        centre,
      )
    } else {
      expect(
        afterBox.x + afterBox.width,
        `payment ${index} shows its balance left of the line`,
      ).toBeLessThanOrEqual(centre)
    }
    // Card and balance share the row.
    expect(
      Math.abs(afterBox.y + afterBox.height / 2 - (cardBox.y + cardBox.height / 2)),
      `entry ${index} card and balance are on one row`,
    ).toBeLessThanOrEqual(cardBox.height)

    // Each card belongs to the day pill of its own date: the pill for that date
    // stands above it, and the next day's pill (if any) stands below it.
    const dayBox = await boxOf(page.locator(`[data-day="${expected.day}"]`), `the ${expected.day} pill`)
    expect(dayBox.y, `entry ${index} comes under its own day pill`).toBeLessThanOrEqual(cardBox.y)
    const nextDay = DAYS[DAYS.indexOf(expected.day) - 1]
    if (nextDay) {
      const nextBox = await boxOf(page.locator(`[data-day="${nextDay}"]`), `the ${nextDay} pill`)
      expect(nextBox.y, `entry ${index} comes after the newer day`).toBeLessThanOrEqual(cardBox.y)
    }
  }

  // The newest entry's balance is the one the box claims, in Abbaas's teal.
  expect(ENTRIES[0]!.after, "the newest balance is the box's").toBe('79000')
  expect(await styleOf(afters.first(), 'color')).toBe('rgb(11, 87, 80)')

  // ----- The fade above the bottom buttons. -----
  const fade = page.locator('[data-fade]')
  await expect(fade).toHaveCount(1)
  await expect(fade).toHaveAttribute('aria-hidden', 'true')
  expect(await styleOf(fade, 'pointer-events')).toBe('none')
  expect(await styleOf(fade, 'position')).toBe('fixed')
  const fadeBox = await boxOf(fade, 'the fade')
  expect(fadeBox.height, 'the fade is tall enough to cover the buttons').toBeGreaterThanOrEqual(120)
  expect(
    Math.abs(viewport.height - (fadeBox.y + fadeBox.height)),
    'the fade is anchored to the bottom of the screen',
  ).toBeLessThanOrEqual(2)

  // The buttons still sit over it.
  await expect(page.locator('[data-action="send"]')).toBeVisible()
  await expect(page.locator('[data-action="receive"]')).toBeVisible()

  // ----- The sizes hold from 360 px to the 560 px column, with no sideways scroll. -----
  for (const width of [360, 414, 560, 1024]) {
    await page.setViewportSize({ width, height: 844 })
    // A relayout may re-run an entrance; measure the resting board only.
    await settled(page)
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scroll.scrollWidth, `no horizontal scroll at ${width} px`).toBeLessThanOrEqual(
      scroll.clientWidth,
    )

    // Sends stay on their own side at every width.
    // The column is centred at every width, so the centre line is the page's middle.
    const line = scroll.clientWidth / 2
    const firstSend = entries.first()
    const sendBox = await boxOf(firstSend, `the newest send at ${width} px`)
    expect(sendBox.x + sendBox.width, `the send stays left of the line at ${width} px`).toBeLessThanOrEqual(
      line,
    )
  }
  await page.setViewportSize(viewport)
  await settled(page)

  // A read that fails is never drawn as a ledger.
  await expect(page.locator('[role="alert"]')).toHaveCount(0)
})
