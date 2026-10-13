import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, readEntries, seedHistory, type Account } from '../support/accounts.js'

// Delete value 1: tapping an entry card opens its sheet.
//
// Judged through the declared public port only: the built bundle's DOM as a phone
// browser sees it - Home's entry cards, the sheet they open (role=dialog with
// data-entry-sheet, its title, data-sheet-usd, data-sheet-mvr, data-sheet-rate,
// data-sheet-person, data-sheet-date, its Delete and Close buttons), the
// data-sheet-scrim over the dimmed Home, the hash the back button walks, and
// Home's own data-screen, data-count and balance boxes - plus, outside the
// browser, the rows the account still holds, so a sheet that quietly wrote
// something is caught.
//
// Nothing here taps Delete: value 1 adds the sheet and its Close paths only.

const PASSWORD_FIELD = 'input[type="password"]'
// The refined board is read at this phone size, which the stimulus fixes.
const VIEWPORT = { width: 390, height: 844 } as const

const ACCOUNT = {
  email: 'owner-entry-sheet@abbaas.test',
  password: 'entry-sheet-password-1',
} as const

const SEEDED_PERSON = 'Mariyam Nisha'

/**
 * The stimulus dates every seeded entry the device's today, because the sheet's
 * Date row has to read the day exactly as Home labels it ('Today · ...'). The
 * browser and this process share one system clock and time zone, so today is
 * worked out here in local terms, as the app works it out in the page.
 */
const deviceToday = (): string => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
const TODAY = deviceToday()

// A USD send of $400.00, an MVR send of MVR 10,000 at 20.00 ($500.00) and a
// $300.00 payment from Abbaas: so Abbaas holds $600.00, and the three cards are
// told apart by their dollar figures.
const USD_SEND_CENTS = 40000
const MVR_SEND_CENTS = 50000
const PAYMENT_CENTS = 30000
const HELD_CENTS = USD_SEND_CENTS + MVR_SEND_CENTS - PAYMENT_CENTS

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
  await seedHistory(
    stack,
    account,
    [SEEDED_PERSON],
    [
      {
        kind: 'send',
        currency: 'USD',
        amountMinor: USD_SEND_CENTS,
        rate: null,
        usdCents: USD_SEND_CENTS,
        entryDate: TODAY,
        savedAt: `${TODAY}T03:00:00.000Z`,
        personName: SEEDED_PERSON,
      },
      {
        kind: 'send',
        currency: 'MVR',
        amountMinor: 1000000,
        rate: '20.0000',
        usdCents: MVR_SEND_CENTS,
        entryDate: TODAY,
        savedAt: `${TODAY}T04:00:00.000Z`,
        personName: SEEDED_PERSON,
      },
      {
        kind: 'receive',
        currency: 'USD',
        amountMinor: PAYMENT_CENTS,
        rate: null,
        usdCents: PAYMENT_CENTS,
        entryDate: TODAY,
        savedAt: `${TODAY}T05:00:00.000Z`,
      },
    ],
  )
})

test.afterAll(async () => {
  await served?.close()
})

/**
 * Every entrance, the sheet's rise and its fall mark what is still travelling
 * with data-motion. Each reading below is taken only once nothing carries it, so
 * the sheet is read once it rests and its absence is read once it is wholly gone
 * rather than merely on its way out.
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
  // The Home that sign-in reaches plays its entrance; let it land.
  await settled(page)
}

/** The card for a given dollar figure, which is how the stimulus names an entry. */
const cardWith = (page: Page, amount: string): Locator =>
  page.locator('[data-entry]').filter({ hasText: amount })

const sheet = (page: Page): Locator => page.locator('[data-entry-sheet]')
const scrim = (page: Page): Locator => page.locator('[data-sheet-scrim]')

/**
 * Home as it was before any sheet was opened: the same screen, the same three
 * cards, the same count and the same balance. Opening and closing a sheet reads
 * an entry and writes nothing, so this holds after every close path - and the
 * stored rows are read outside the browser to say so of the ledger itself.
 */
const expectHomeUnchanged = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  await expect(sheet(page)).toHaveCount(0)
  await expect(scrim(page)).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(3)
  await expect(page.locator('[data-count]')).toHaveAttribute('data-count', '3')
  await expect(page.locator('[data-box="abbaas"]')).toHaveAttribute(
    'data-amount',
    String(HELD_CENTS),
  )
  await expect(page.locator('[data-box="abbaas"]')).toContainText('$600.00')
  expect(await readEntries(stack, account)).toHaveLength(3)
}

test('tapping an entry card opens its sheet over the dimmed Home, which reads the entry as recorded; Close, the scrim and the back button all close it and leave Home as it was', async ({
  page,
}) => {
  await signIn(page)

  // ----- Home before any sheet: three entries and $600.00 held. -----
  await expectHomeUnchanged(page)

  // ===== The MVR send: tapping its card opens its sheet. =====
  const mvrCard = cardWith(page, '$500.00')
  await expect(mvrCard).toHaveCount(1)
  const mvrId = await mvrCard.getAttribute('data-entry')
  expect(mvrId, 'the card carries the entry id the sheet is named by').toBeTruthy()

  await mvrCard.click()
  // The sheet rises and the scrim fades in; read it at rest.
  await settled(page)

  // One visible dialog, and it is this entry's.
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-entry-sheet', mvrId!)
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(scrim(page)).toBeVisible()

  // The entry as recorded: what it was, its dollar figure, its rufiyaa figure
  // and rate, who it was paid to, and its day as Home labels it.
  await expect(dialog).toContainText('Sent for Abbaas')
  await expect(dialog.locator('[data-sheet-usd]')).toHaveText('$500.00')
  await expect(dialog.locator('[data-sheet-mvr]')).toContainText('MVR 10,000')
  await expect(dialog.locator('[data-sheet-rate]')).toContainText('20.00')
  await expect(dialog.locator('[data-sheet-person]')).toContainText(SEEDED_PERSON)
  await expect(dialog.locator('[data-sheet-date]')).toContainText('Today')

  // Both buttons at the foot, named as the owner reads them.
  const deleteButton = dialog.getByRole('button', { name: 'Delete' })
  const closeButton = dialog.getByRole('button', { name: 'Close' })
  await expect(deleteButton).toBeVisible()
  await expect(closeButton).toBeVisible()
  // Nothing of this value touches Delete; it is only offered.

  // Focus has moved into the sheet, onto Close.
  await expect(closeButton).toBeFocused()

  // ----- Close: the sheet and the scrim go, Home is untouched. -----
  await closeButton.click()
  await settled(page)
  await expectHomeUnchanged(page)
  // Focus returns to the card that was tapped.
  await expect(mvrCard).toBeFocused()

  // ===== The payment: a sheet with no person, no rufiyaa figure and no rate. =====
  const paymentCard = cardWith(page, '$300.00')
  await expect(paymentCard).toHaveCount(1)
  const paymentId = await paymentCard.getAttribute('data-entry')
  await paymentCard.click()
  await settled(page)

  const paymentSheet = page.getByRole('dialog')
  await expect(paymentSheet).toHaveAttribute('data-entry-sheet', paymentId!)
  await expect(paymentSheet).toContainText('Paid back by Abbaas')
  await expect(paymentSheet).not.toContainText('Sent for Abbaas')
  await expect(paymentSheet.locator('[data-sheet-usd]')).toHaveText('$300.00')
  await expect(paymentSheet.locator('[data-sheet-person]')).toHaveCount(0)
  await expect(paymentSheet.locator('[data-sheet-mvr]')).toHaveCount(0)
  await expect(paymentSheet.locator('[data-sheet-rate]')).toHaveCount(0)
  await expect(paymentSheet.locator('[data-sheet-date]')).toContainText('Today')

  // ----- A tap on the dimmed Home closes it. The sheet sits at the bottom of
  // the column, so a point near the top of the scrim is the dimmed Home itself.
  await scrim(page).click({ position: { x: 10, y: 10 } })
  await settled(page)
  await expectHomeUnchanged(page)

  // ===== The USD send: the phone's back button closes the sheet, not Home. =====
  const usdCard = cardWith(page, '$400.00')
  await expect(usdCard).toHaveCount(1)
  const usdId = await usdCard.getAttribute('data-entry')
  await usdCard.click()
  await settled(page)
  await expect(page.getByRole('dialog')).toHaveAttribute('data-entry-sheet', usdId!)
  // A USD send names no rufiyaa figure and no rate, and does name who was paid.
  await expect(page.locator('[data-sheet-usd]')).toHaveText('$400.00')
  await expect(page.locator('[data-sheet-mvr]')).toHaveCount(0)
  await expect(page.locator('[data-sheet-rate]')).toHaveCount(0)
  await expect(page.locator('[data-sheet-person]')).toContainText(SEEDED_PERSON)
  // The sheet was pushed onto the ordinary history, which is what makes the
  // phone's back button able to close it.
  expect(new URL(page.url()).hash).toBe(`#entry/${usdId}`)

  await page.goBack()
  await settled(page)
  // Back closes the sheet and leaves Home in place: it does not leave the app.
  await expectHomeUnchanged(page)
  expect(new URL(page.url()).hash).not.toContain('entry/')

  // ===== Opening '#entry/<id>' directly shows Home with that sheet open. =====
  await page.goto(`${ORIGIN}/#entry/${usdId}`)
  await settled(page)
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveAttribute('data-entry-sheet', usdId!)
  await expect(page.locator('[data-sheet-usd]')).toHaveText('$400.00')
  await expect(scrim(page)).toBeVisible()
  // Home underneath still reads the whole ledger.
  await expect(page.locator('[data-entry]')).toHaveCount(3)
  await expect(page.locator('[data-count]')).toHaveAttribute('data-count', '3')
  await expect(page.locator('[data-box="abbaas"]')).toHaveAttribute(
    'data-amount',
    String(HELD_CENTS),
  )

  // Nothing of all this wrote anything.
  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(3)
  expect(stored.map((entry) => entry.usd_cents)).toEqual([
    USD_SEND_CENTS,
    MVR_SEND_CENTS,
    PAYMENT_CENTS,
  ])
})

/**
 * The declared Refusal: a hash naming an entry the read ledger does not hold is
 * not an error the owner has to read, and it is not a sheet either - it is Home.
 */
test('a hash naming an entry that is not in the ledger shows Home with no sheet and no error', async ({
  page,
}) => {
  await signIn(page)

  await page.goto(`${ORIGIN}/#entry/3f1b2c4d-0000-4000-8000-000000000000`)
  await settled(page)

  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  await expect(sheet(page)).toHaveCount(0)
  await expect(scrim(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(3)
  await expect(page.locator('[data-count]')).toHaveAttribute('data-count', '3')
  expect(await readEntries(stack, account)).toHaveLength(3)
})
