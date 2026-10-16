import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, seedPerson, type Account } from '../support/accounts.js'

// Third line value 1: the method takes the detail line's place.
//
// Judged through the declared public port only: the built bundle's DOM as a phone
// browser sees it - Home's entry cards, the three lines each card is now made of
// (the amount ALONE on the first, the party on the second, and the method on the
// third when there is one), and the sheet a tap on the card opens, whose lines are
// unchanged: Method (data-sheet-method) above Date (data-sheet-date), with the
// rufiyaa figure and rate still named for an MVR entry.
//
// What this value claims is a matter of WHERE and of WHAT IS NOT THERE, so both
// are read as the owner's eye reads them: the lines are told apart by their boxes
// - each one strictly below the one above it, never sharing a band - and the card's
// whole text is read end to end, so a pill left on the amount line or a surviving
// currency detail has nowhere to hide.
//
// The method is READ here, never written: the stimulus stores it outside the
// browser. The acceptance support deliberately seeds entries without the method
// column, so this spec reaches the column itself through the service role, as the
// method contract says a spec that must seed it does.

const PASSWORD_FIELD = 'input[type="password"]'
// The board is read at this phone size, which the stimulus fixes, and read again
// at the narrowest phone the layout answers for, where an overflow shows first.
const VIEWPORT = { width: 390, height: 844 } as const
const NARROW = { width: 360, height: 780 } as const

const ACCOUNT = {
  email: 'owner-entry-method@abbaas.test',
  password: 'entry-method-password-1',
} as const

const SEEDED_PERSON = 'Mariyam Nisha'

/**
 * Every seeded entry is dated the device's today, as the stimulus fixes, so all
 * five cards stand in one day group and are told apart by their dollar figures
 * alone. The browser and this process share one clock and zone.
 */
const deviceToday = (): string => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
const TODAY = deviceToday()

/**
 * The five entries of the stimulus, each known by its dollar figure: a send paid
 * by cheque, a payment from Abbaas taken in cash, an MVR send transferred, a
 * wide-figure send transferred (the longest amount and the longest word together,
 * which is where a third line would overflow a narrow card if it could), and a
 * send stored with NO method at all - the one card that must have only two lines
 * and whose sheet must hold no Method line.
 *
 * `party` is the second line's exact text, so each card's whole text can be read
 * end to end and nothing extra can be hiding in it.
 */
const PARTY_SENT = `to ${SEEDED_PERSON}`
const PARTY_PAID = 'from Abbaas'

const CHEQUE_SEND = {
  text: '$250.00',
  method: 'cheque',
  word: 'Cheque',
  party: PARTY_SENT,
} as const
const CASH_PAYMENT = {
  text: '$300.00',
  method: 'cash',
  word: 'Cash',
  party: PARTY_PAID,
} as const
const TRANSFER_MVR_SEND = {
  text: '$500.00',
  method: 'transfer',
  word: 'Transfer',
  party: PARTY_SENT,
} as const
const TRANSFER_WIDE_SEND = {
  text: '$1,290.00',
  method: 'transfer',
  word: 'Transfer',
  party: PARTY_SENT,
} as const
const NO_METHOD_SEND = {
  text: '$90.00',
  method: null,
  word: null,
  party: PARTY_SENT,
} as const

/** Every card the stimulus seeds, in no particular order: each is found by its figure. */
const EVERY_CARD = [
  CHEQUE_SEND,
  CASH_PAYMENT,
  TRANSFER_MVR_SEND,
  TRANSFER_WIDE_SEND,
  NO_METHOD_SEND,
] as const

const WORDS = ['Cash', 'Cheque', 'Transfer'] as const

/** The currency detail Home no longer draws, in every form it ever took. */
const GONE_FROM_CARDS = ['Paid in USD', 'MVR', ' at 20.00'] as const

let stack: Stack
let served: ServedOrigin
let account: Account

test.use({ viewport: VIEWPORT })
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, ACCOUNT)
  const personId = await seedPerson(stack, account, SEEDED_PERSON)

  // The method column is reached here rather than through the support, which
  // knows nothing of it. An insert that fails because the column or its check is
  // missing fails this hook, so a missing migration is never read as a missing
  // method line.
  const admin = createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await admin.from('entries').insert([
    {
      user_id: account.userId,
      kind: 'send',
      currency: 'USD',
      amount_minor: 25000,
      rate: null,
      usd_cents: 25000,
      entry_date: TODAY,
      saved_at: `${TODAY}T03:00:00.000Z`,
      person_id: personId,
      person_name: SEEDED_PERSON,
      method: CHEQUE_SEND.method,
    },
    {
      user_id: account.userId,
      kind: 'receive',
      currency: 'USD',
      amount_minor: 30000,
      rate: null,
      usd_cents: 30000,
      entry_date: TODAY,
      saved_at: `${TODAY}T04:00:00.000Z`,
      person_id: null,
      person_name: null,
      method: CASH_PAYMENT.method,
    },
    {
      user_id: account.userId,
      kind: 'send',
      currency: 'MVR',
      amount_minor: 1000000,
      rate: '20.0000',
      usd_cents: 50000,
      entry_date: TODAY,
      saved_at: `${TODAY}T05:00:00.000Z`,
      person_id: personId,
      person_name: SEEDED_PERSON,
      method: TRANSFER_MVR_SEND.method,
    },
    {
      // The widest figure the board holds, carrying the longest word: amount and
      // method together on one narrow card.
      user_id: account.userId,
      kind: 'send',
      currency: 'USD',
      amount_minor: 129000,
      rate: null,
      usd_cents: 129000,
      entry_date: TODAY,
      saved_at: `${TODAY}T05:30:00.000Z`,
      person_id: personId,
      person_name: SEEDED_PERSON,
      method: TRANSFER_WIDE_SEND.method,
    },
    {
      user_id: account.userId,
      kind: 'send',
      currency: 'USD',
      amount_minor: 9000,
      rate: null,
      usd_cents: 9000,
      entry_date: TODAY,
      saved_at: `${TODAY}T06:00:00.000Z`,
      person_id: personId,
      person_name: SEEDED_PERSON,
      method: NO_METHOD_SEND.method,
    },
  ])
  if (error) {
    throw new Error(`Could not seed the five entries with their methods: ${error.message}`)
  }
})

test.afterAll(async () => {
  await served?.close()
})

/**
 * Every entrance, the travelling cards and the sheet's rise and fall mark what is
 * still moving with data-motion. Each reading below is taken only once nothing
 * carries it, so a line is measured where it RESTS - which is the whole claim
 * about which line sits under which - and never mid-flight.
 */
const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-motion]')).toHaveCount(0)
}

const signIn = async (page: Page): Promise<void> => {
  await page.goto(ORIGIN)
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
  await settled(page)
}

/** The card for a given dollar figure, which is how the stimulus names an entry. */
const cardWith = (page: Page, amount: string): Locator =>
  page.locator('[data-entry]').filter({ hasText: amount })

/** A laid-out element's box, failed loudly rather than quietly skipped. */
const boxOf = async (locator: Locator, what: string) => {
  const box = await locator.boundingBox()
  expect(box, `${what} is laid out and measurable`).not.toBeNull()
  return box!
}

type Box = { x: number; y: number; width: number; height: number }

/**
 * Whether the card's box holds a line's box whole, within a pixel of rounding:
 * this is what 'nothing overflows the card' means when the owner looks at it.
 */
const contains = (card: Box, line: Box): boolean =>
  line.x >= card.x - 1 &&
  line.y >= card.y - 1 &&
  line.x + line.width <= card.x + card.width + 1 &&
  line.y + line.height <= card.y + card.height + 1

/**
 * The card's lines, in the order the owner reads them: the amount, the party and,
 * when the entry has a method, the method. Read as boxes, because 'the third line
 * under the person' and 'the amount alone on the first line' are claims about
 * where things lie, not about markup.
 */
const linesOf = async (
  card: Locator,
  entry: { readonly text: string; readonly party: string; readonly word: string | null },
): Promise<readonly { readonly what: string; readonly box: Box }[]> => {
  const amount = card.getByText(entry.text, { exact: true })
  await expect(amount, `the ${entry.text} card shows its figure as one element`).toHaveCount(1)
  const party = card.getByText(entry.party, { exact: true })
  await expect(party, `the ${entry.text} card shows '${entry.party}' as one element`).toHaveCount(1)

  const lines = [
    { what: `the ${entry.text} figure`, box: await boxOf(amount, `the ${entry.text} figure`) },
    { what: `the '${entry.party}' line`, box: await boxOf(party, `the '${entry.party}' line`) },
  ]
  if (entry.word === null) return lines
  const method = card.locator('[data-entry-method]')
  return [
    ...lines,
    { what: `the ${entry.word} line`, box: await boxOf(method, `the ${entry.word} line`) },
  ]
}

test('each Home card reads its amount alone, then its person, then its method as a third line in place of the currency detail, overflowing neither phone; a card without a method has only two lines, and every sheet still names the method above the Date', async ({
  page,
}) => {
  await signIn(page)

  // ----- Home holds the five seeded entries. -----
  await expect(page.locator('[data-entry]')).toHaveCount(5)

  // ===== Each card: three lines in order, or two when nothing was stored. =====
  for (const entry of EVERY_CARD) {
    const card = cardWith(page, entry.text)
    await expect(card, `exactly one card reads ${entry.text}`).toHaveCount(1)

    const method = card.locator('[data-entry-method]')
    if (entry.word === null) {
      // A null method is nothing said, so there is no third line at all and the
      // card never utters one of the three words.
      await expect(method, `the ${entry.text} card has no method line`).toHaveCount(0)
      for (const word of WORDS) {
        await expect(card, `the ${entry.text} card does not read ${word}`).not.toContainText(word)
      }
    } else {
      await expect(method, `the ${entry.text} card has one method line`).toHaveCount(1)
      await expect(method).toBeVisible()
      await expect(method).toHaveAttribute('data-entry-method', entry.method)
      // The owner reads the word, and the word is the whole of the line's text:
      // the stored token names the element, it is never shown.
      await expect(method).toHaveText(entry.word)
      // With its icon before it, which says the same thing and so is read by
      // nobody: exactly one, and the first thing in the line.
      await expect(method.locator('svg')).toHaveCount(1)
      expect(
        await method.evaluate((line) => line.firstElementChild?.tagName.toLowerCase() ?? null),
        `the ${entry.word} line opens with its icon`,
      ).toBe('svg')
    }

    // The card's WHOLE text, end to end: the figure, then the party, then the
    // method word and nothing else. This is what makes the claim total - a pill
    // left on the amount line or a surviving currency detail would add text
    // here, wherever it was drawn.
    const bare = (text: string): string => text.replace(/\s+/g, '')
    const expected = bare(`${entry.text}${entry.party}${entry.word ?? ''}`)
    expect(
      bare((await card.textContent()) ?? ''),
      `the ${entry.text} card reads its amount, its party and its method, and nothing else`,
    ).toBe(expected)
    // Said again of the detail by name, so a failure says which words came back.
    for (const gone of GONE_FROM_CARDS) {
      await expect(card, `the ${entry.text} card does not read '${gone}'`).not.toContainText(gone)
    }

    // The lines lie one under the other, in reading order, never sharing a band:
    // so the amount is ALONE on the first line and the method is BELOW the
    // person, which is the whole of this value.
    const lines = await linesOf(card, entry)
    for (let index = 1; index < lines.length; index += 1) {
      const above = lines[index - 1]!
      const below = lines[index]!
      expect(
        below.box.y,
        `${below.what} begins at or below the bottom of ${above.what}`,
      ).toBeGreaterThanOrEqual(above.box.y + above.box.height - 1)
    }
  }

  // So Home carries exactly four method lines in all: no card gained an extra one.
  await expect(page.locator('[data-entry-method]')).toHaveCount(4)

  // ===== Nothing overflows its card, at either phone width. =====
  for (const size of [VIEWPORT, NARROW]) {
    await page.setViewportSize(size)
    // The layout is read at rest, after the width has settled.
    await settled(page)
    for (const entry of EVERY_CARD) {
      const card = cardWith(page, entry.text)
      const cardBox = await boxOf(card, `the ${entry.text} card at ${size.width} px`)
      for (const line of await linesOf(card, entry)) {
        expect(
          contains(cardBox, line.box),
          `${line.what} lies wholly inside its card at ${size.width} px`,
        ).toBe(true)
      }
    }
  }
  await page.setViewportSize(VIEWPORT)
  await settled(page)

  // ===== Each sheet is unchanged: a Method line above Date, and the MVR figures. =====
  for (const entry of EVERY_CARD) {
    const card = cardWith(page, entry.text)
    const id = await card.getAttribute('data-entry')
    await card.click()
    await settled(page)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveAttribute('data-entry-sheet', id!)
    const date = dialog.locator('[data-sheet-date]')
    await expect(date).toBeVisible()

    const method = dialog.locator('[data-sheet-method]')
    if (entry.word === null) {
      // Nothing was stored, so nothing is claimed: no Method line at all, and the
      // sheet never utters one of the three words.
      await expect(method, `the ${entry.text} sheet has no Method line`).toHaveCount(0)
      for (const word of WORDS) {
        await expect(dialog, `the ${entry.text} sheet does not read ${word}`).not.toContainText(word)
      }
    } else {
      await expect(method, `the ${entry.text} sheet has one Method line`).toHaveCount(1)
      await expect(method).toBeVisible()
      // The line reads the label and the word. Which of the row or its value
      // carries the attribute is the renderer's business, so the word is read on
      // the named element and the label on the sheet that holds it.
      await expect(method).toContainText(entry.word)
      await expect(dialog).toContainText('Method')
      // It is placed before the Date line, as the board reads it.
      const methodBox = await boxOf(method, `the ${entry.text} sheet's Method line`)
      const dateBox = await boxOf(date, `the ${entry.text} sheet's Date line`)
      expect(
        methodBox.y,
        `the ${entry.text} sheet reads Method above Date`,
      ).toBeLessThan(dateBox.y)
      // Only this entry's own method is named: no other word appears.
      for (const word of WORDS.filter((other) => other !== entry.word)) {
        await expect(dialog, `the ${entry.text} sheet does not read ${word}`).not.toContainText(word)
      }
    }

    // The sheet is where the rufiyaa went: the figures Home no longer shows are
    // still named here, for the one entry stored in MVR and for no other.
    const mvr = dialog.locator('[data-sheet-mvr]')
    const rate = dialog.locator('[data-sheet-rate]')
    if (entry.text === TRANSFER_MVR_SEND.text) {
      await expect(mvr, `the ${entry.text} sheet names its rufiyaa`).toHaveCount(1)
      await expect(mvr).toContainText('MVR 10,000')
      await expect(rate, `the ${entry.text} sheet names its rate`).toHaveCount(1)
      await expect(rate).toContainText('20.00')
    } else {
      await expect(mvr, `the ${entry.text} sheet has no rufiyaa line`).toHaveCount(0)
      await expect(rate, `the ${entry.text} sheet has no rate line`).toHaveCount(0)
    }

    // Close it the way the owner does, and let it fall before the next card.
    await dialog.getByRole('button', { name: 'Close' }).click()
    await settled(page)
    await expect(page.locator('[data-entry-sheet]')).toHaveCount(0)
  }

  // Reading methods wrote nothing: the five entries stand as seeded.
  await expect(page.locator('[data-entry]')).toHaveCount(5)
})
