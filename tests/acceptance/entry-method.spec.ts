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

// Method value 3: the method on Home's cards and in the entry sheet.
//
// Judged through the declared public port only: the built bundle's DOM as a phone
// browser sees it - Home's entry cards and the method tag they carry
// (data-entry-method), where that tag sits relative to the card's own dollar
// figure, and the sheet a tap on the card opens with its Method line
// (data-sheet-method) above the Date line (data-sheet-date).
//
// The method is READ here, never written: the stimulus stores it outside the
// browser. The acceptance support deliberately seeds entries without the method
// column, so this spec reaches the column itself through the service role, as the
// method contract says a spec that must seed it does.

const PASSWORD_FIELD = 'input[type="password"]'
// The board is read at this phone size, which the stimulus fixes.
const VIEWPORT = { width: 390, height: 844 } as const

const ACCOUNT = {
  email: 'owner-entry-method@abbaas.test',
  password: 'entry-method-password-1',
} as const

const SEEDED_PERSON = 'Mariyam Nisha'

/**
 * Every seeded entry is dated the device's today, as the stimulus fixes, so all
 * four cards stand in one day group and are told apart by their dollar figures
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
 * The four entries of the stimulus, each known by its dollar figure: a send paid
 * by cheque, a payment from Abbaas taken in cash, an MVR send transferred, and a
 * send stored with NO method at all - the one card that must carry no tag and
 * whose sheet must hold no Method line.
 */
const CHEQUE_SEND = { text: '$250.00', method: 'cheque', word: 'Cheque', kind: 'send' } as const
const CASH_PAYMENT = { text: '$300.00', method: 'cash', word: 'Cash', kind: 'receive' } as const
const TRANSFER_SEND = { text: '$500.00', method: 'transfer', word: 'Transfer', kind: 'send' } as const
const NO_METHOD_SEND = { text: '$90.00', method: null, word: null, kind: 'send' } as const

const WORDS = ['Cash', 'Cheque', 'Transfer'] as const

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
  // tag.
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
      method: TRANSFER_SEND.method,
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
    throw new Error(`Could not seed the four entries with their methods: ${error.message}`)
  }
})

test.afterAll(async () => {
  await served?.close()
})

/**
 * Every entrance, the travelling cards and the sheet's rise and fall mark what is
 * still moving with data-motion. Each reading below is taken only once nothing
 * carries it, so a tag is measured where it RESTS - which is the whole claim that
 * the tag sits at the card's inner edge - and never mid-flight.
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

test('each Home card shows its stored method as a tag at the inner edge of its amount line, and its sheet names the method above the Date; an entry stored without one shows neither', async ({
  page,
}) => {
  await signIn(page)

  // ----- Home holds the four seeded entries. -----
  await expect(page.locator('[data-entry]')).toHaveCount(4)

  // ===== The tag on each card: the right word, and only where there is a method. =====
  for (const entry of [CHEQUE_SEND, CASH_PAYMENT, TRANSFER_SEND]) {
    const card = cardWith(page, entry.text)
    await expect(card, `exactly one card reads ${entry.text}`).toHaveCount(1)

    const tag = card.locator('[data-entry-method]')
    await expect(tag, `the ${entry.text} card carries exactly one method tag`).toHaveCount(1)
    await expect(tag).toBeVisible()
    await expect(tag).toHaveAttribute('data-entry-method', entry.method)
    // The owner reads the word, not the stored token.
    await expect(tag).toHaveText(entry.word)

    // The tag sits at the card's INNER edge, nearest the centre line, with the
    // amount left on the outer edge. A send's card rests on Abbaas's right half,
    // so its inner edge is its left one; a payment rests on the owner's left
    // half, so its inner edge is its right one.
    const amount = card.getByText(entry.text, { exact: true })
    await expect(amount, `the ${entry.text} card shows its figure as one element`).toHaveCount(1)
    const tagBox = await boxOf(tag, `the ${entry.word} tag`)
    const amountBox = await boxOf(amount, `the ${entry.text} figure`)
    if (entry.kind === 'send') {
      expect(
        tagBox.x + tagBox.width,
        `the ${entry.word} tag lies left of ${entry.text}, toward the centre line`,
      ).toBeLessThanOrEqual(amountBox.x)
    } else {
      expect(
        amountBox.x + amountBox.width,
        `the ${entry.word} tag lies right of ${entry.text}, toward the centre line`,
      ).toBeLessThanOrEqual(tagBox.x)
    }
  }

  // The entry stored without a method reads as it did before any of this: no tag
  // and none of the three words anywhere on its card.
  const bareCard = cardWith(page, NO_METHOD_SEND.text)
  await expect(bareCard).toHaveCount(1)
  await expect(bareCard.locator('[data-entry-method]')).toHaveCount(0)
  for (const word of WORDS) {
    await expect(bareCard, `the ${NO_METHOD_SEND.text} card does not read ${word}`).not.toContainText(
      word,
    )
  }
  // So Home carries exactly three tags in all: no card gained an extra one.
  await expect(page.locator('[data-entry-method]')).toHaveCount(3)

  // ===== Each sheet: a Method line above Date, except for the entry with none. =====
  for (const entry of [CHEQUE_SEND, CASH_PAYMENT, TRANSFER_SEND, NO_METHOD_SEND]) {
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

    // Close it the way the owner does, and let it fall before the next card.
    await dialog.getByRole('button', { name: 'Close' }).click()
    await settled(page)
    await expect(page.locator('[data-entry-sheet]')).toHaveCount(0)
  }

  // Reading methods wrote nothing: the four entries stand as seeded.
  await expect(page.locator('[data-entry]')).toHaveCount(4)
})
