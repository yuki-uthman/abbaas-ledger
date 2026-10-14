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

// Delete value 3: one tap on Delete removes the entry at once.
//
// This replaces the confirmation integrated at 52ffbc4: the owner asked on
// 2026-10-14 for the question to go, so this oracle asserts that no question is
// ever asked and no Cancel is ever offered, and that the single tap is itself the
// delete.
//
// Judged through the declared public port only: the built bundle's DOM as a phone
// browser sees it - the sheet's foot in each of its three declared states (at
// rest, while the removal is out, and after a Retry with its role=alert note),
// Home's cards, its data-count, its balance boxes and its data-total figures, and
// the hash the back button walks - plus, outside the browser, the rows the
// account still holds, read through the service role, so a delete that only
// removed a card is caught and a delete that removed a row it should not have is
// caught too.
//
// The unreachable server is driven at the same public port: every DELETE the
// bundle sends to the entries endpoint is aborted by the browser, so the app is
// judged on a real network failure rather than on a seam reached behind its back.

const PASSWORD_FIELD = 'input[type="password"]'
// The refined board is read at this phone size, which the stimulus fixes.
const VIEWPORT = { width: 390, height: 844 } as const

const ACCOUNT = {
  email: 'owner-delete-entry@abbaas.test',
  password: 'delete-entry-password-2',
} as const

const SEEDED_PERSON = 'Mariyam Nisha'

/** Every DELETE the bundle sends against the ledger goes through this path. */
const ENTRIES_ENDPOINT = '**/rest/v1/entries**'

/**
 * The stimulus dates every seeded entry the device's today, because the sheet's
 * Date row reads the day exactly as Home labels it. The browser and this process
 * share one system clock and time zone, so today is worked out here in local
 * terms, as the app works it out in the page.
 */
const deviceToday = (): string => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
const TODAY = deviceToday()

// A USD send of $400.00, an MVR send of MVR 10,000 at 20.00 ($500.00) and a
// $300.00 payment from Abbaas: Abbaas holds $600.00, and the three cards are told
// apart by their dollar figures. The $400.00 send is the one deleted, which
// leaves $500.00 sent, $300.00 paid back and $200.00 held.
const USD_SEND_CENTS = 40000
const MVR_SEND_CENTS = 50000
const PAYMENT_CENTS = 30000
const HELD_BEFORE_CENTS = USD_SEND_CENTS + MVR_SEND_CENTS - PAYMENT_CENTS
const HELD_AFTER_CENTS = MVR_SEND_CENTS - PAYMENT_CENTS

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
 * The sheet's rise, its fall and every entrance mark what is still travelling
 * with data-motion. Each reading below is taken only once nothing carries it, so
 * the sheet's absence after a delete is read once it is wholly gone rather than
 * merely on its way out, and Home's recounted figures are read at rest.
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
 * Home recounted from what is stored: two cards, the deleted figure nowhere, the
 * count down by one, the holder's box and both totals worked out from the
 * entries that remain - and no message of any kind about the delete, which the
 * decisions rule out. The stored rows are read outside the browser too, so a
 * card that merely vanished from the page is caught.
 */
const expectHomeWithoutTheSend = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  await expect(sheet(page)).toHaveCount(0)
  await expect(scrim(page)).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(2)
  await expect(cardWith(page, '$400.00')).toHaveCount(0)
  await expect(cardWith(page, '$500.00')).toHaveCount(1)
  await expect(cardWith(page, '$300.00')).toHaveCount(1)
  await expect(page.locator('[data-count]')).toHaveAttribute('data-count', '2')

  const abbaasBox = page.locator('[data-box="abbaas"]')
  await expect(abbaasBox).toHaveAttribute('data-amount', String(HELD_AFTER_CENTS))
  await expect(abbaasBox).toContainText('$200.00')
  await expect(page.locator('[data-total="sent"]')).toContainText('$500.00')
  await expect(page.locator('[data-total="paid"]')).toContainText('$300.00')

  // The card's absence and the recounted boxes are the whole feedback.
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Stored, not only drawn: the $400.00 send is gone and the other two remain.
  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(2)
  expect(stored.map((entry) => entry.usd_cents)).toEqual([MVR_SEND_CENTS, PAYMENT_CENTS])
}

/**
 * The question the owner asked to have removed, in every wording the replaced
 * value painted, plus the button it offered. None of it may appear anywhere on
 * the page at any point of a delete.
 */
const expectNothingAsked = async (page: Page): Promise<void> => {
  const body = page.locator('body')
  await expect(body).not.toContainText('Delete this entry?')
  await expect(body).not.toContainText('This cannot be undone.')
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
}

/** The foot at rest and after a Retry: exactly Close then Delete, both enabled. */
const expectFootOffersBothEnabled = async (dialog: Locator): Promise<void> => {
  const close = dialog.getByRole('button', { name: 'Close' })
  const remove = dialog.getByRole('button', { name: 'Delete' })
  await expect(close).toBeVisible()
  await expect(close).toBeEnabled()
  await expect(remove).toBeVisible()
  await expect(remove).toBeEnabled()
  await expect(dialog.locator('[data-sheet-actions]').getByRole('button')).toHaveCount(2)
}

test('one tap on Delete removes the entry at once, with no question and no Cancel: the sheet closes and Home is recounted without it, now and after a reload', async ({
  page,
}) => {
  await signIn(page)

  // ----- Home before any delete: three entries and $600.00 held. -----
  await expect(page.locator('[data-entry]')).toHaveCount(3)
  await expect(page.locator('[data-count]')).toHaveAttribute('data-count', '3')
  await expect(page.locator('[data-box="abbaas"]')).toHaveAttribute(
    'data-amount',
    String(HELD_BEFORE_CENTS),
  )
  expect(await readEntries(stack, account)).toHaveLength(3)

  // ===== Open the $400.00 send's sheet. =====
  const sendCard = cardWith(page, '$400.00')
  await expect(sendCard).toHaveCount(1)
  const sendId = await sendCard.getAttribute('data-entry')
  expect(sendId, 'the card carries the entry id the sheet is named by').toBeTruthy()

  await sendCard.click()
  await settled(page)

  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAttribute('data-entry-sheet', sendId!)
  // At rest the foot offers exactly Close and Delete, and asks nothing.
  await expectFootOffersBothEnabled(dialog)
  await expectNothingAsked(page)
  // The entry being read is the $400.00 send.
  await expect(dialog.locator('[data-sheet-usd]')).toHaveText('$400.00')
  await expect(dialog.locator('[data-sheet-person]')).toContainText(SEEDED_PERSON)
  await expect(dialog.locator('[data-sheet-date]')).toContainText('Today')

  // ----- While the removal is out: the same two buttons, both disabled, and
  // neither the scrim nor Escape is allowed to close the sheet. The DELETE is
  // held at the public port so this state can be read at all; the tap that
  // started it was a single tap, with nothing asked in between. -----
  let releaseDelete = (): void => {}
  const deleteSent = new Promise<void>((resolveSent) => {
    page.route(ENTRIES_ENDPOINT, async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.continue()
        return
      }
      resolveSent()
      await new Promise<void>((resolveHeld) => {
        releaseDelete = resolveHeld
      })
      await route.continue()
    })
  })

  await dialog.getByRole('button', { name: 'Delete' }).click()
  await deleteSent

  // One tap was enough to send it: nothing was asked, and no third button
  // appeared to confirm it.
  await expectNothingAsked(page)
  const closeButton = dialog.getByRole('button', { name: 'Close' })
  const deleteButton = dialog.getByRole('button', { name: 'Delete' })
  await expect(closeButton).toBeVisible()
  await expect(closeButton).toBeDisabled()
  await expect(deleteButton).toBeVisible()
  await expect(deleteButton).toBeDisabled()
  await expect(dialog.locator('[data-sheet-actions]').getByRole('button')).toHaveCount(2)

  // A scrim tap and Escape are ignored while it is out: the sheet stays.
  await scrim(page).click({ position: { x: 10, y: 10 } })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-entry-sheet', sendId!)
  expect(new URL(page.url()).hash).toBe(`#entry/${sendId}`)

  // ----- Let it land: the sheet falls as it does for Close. -----
  releaseDelete()
  await settled(page)
  await page.unroute(ENTRIES_ENDPOINT)

  await expectHomeWithoutTheSend(page)
  await expectNothingAsked(page)
  // The sheet's own hash is gone, so Home is what the phone is showing.
  expect(new URL(page.url()).hash).not.toContain('entry/')

  // ----- The sheet's history entry was left by going back, so the phone's back
  // button does not reopen the sheet of an entry that no longer exists. -----
  await page.goBack()
  await settled(page)
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goForward()
  await settled(page)
  await expect(sheet(page)).toHaveCount(0)

  // ----- A reload reads the same ledger back: the delete was storage, not paint.
  await page.reload()
  await settled(page)
  await expectHomeWithoutTheSend(page)

  // The deleted entry cannot be reached by its own hash either: its sheet is not
  // offered again, and that is Home with no error.
  await page.goto(`${ORIGIN}/#entry/${sendId}`)
  await settled(page)
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('[data-entry]')).toHaveCount(2)
})

/**
 * The declared Retry: a delete that cannot reach the server leaves the entry
 * exactly where it was. The failure is driven at the public port - the browser
 * aborts every DELETE the bundle sends to the entries endpoint - so reads keep
 * working and only the removal fails, as an unreachable write does.
 */
test('a delete that cannot reach the server keeps the sheet open with Could not delete. Try again. and keeps the entry listed and stored', async ({
  page,
}) => {
  await signIn(page)
  // This test follows the first, so two entries remain: $500.00 and $300.00.
  await expect(page.locator('[data-entry]')).toHaveCount(2)
  await expect(page.locator('[data-count]')).toHaveAttribute('data-count', '2')

  await page.route(ENTRIES_ENDPOINT, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.abort('failed')
      return
    }
    await route.continue()
  })

  // ===== Open the $300.00 payment and confirm a delete that cannot land. =====
  const paymentCard = cardWith(page, '$300.00')
  const paymentId = await paymentCard.getAttribute('data-entry')
  await paymentCard.click()
  await settled(page)

  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAttribute('data-entry-sheet', paymentId!)
  await expectFootOffersBothEnabled(dialog)
  // One tap, nothing asked.
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expectNothingAsked(page)

  // ----- The sheet stays open on its details and says so. -----
  const note = dialog.getByRole('alert')
  await expect(note).toContainText('Could not delete. Try again.')
  await settled(page)
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-entry-sheet', paymentId!)
  await expect(scrim(page)).toBeVisible()
  await expect(dialog.locator('[data-sheet-usd]')).toHaveText('$300.00')
  await expect(dialog).toContainText('Paid back by Abbaas')
  // The note sits above the foot, which offers its two ordinary buttons again,
  // enabled, and asks nothing.
  await expectFootOffersBothEnabled(dialog)
  await expectNothingAsked(page)

  // The entry is still listed under the sheet and still stored.
  await expect(page.locator('[data-entry]')).toHaveCount(2)
  await expect(cardWith(page, '$300.00')).toHaveCount(1)
  await expect(page.locator('[data-count]')).toHaveAttribute('data-count', '2')
  await expect(page.locator('[data-box="abbaas"]')).toHaveAttribute(
    'data-amount',
    String(HELD_AFTER_CENTS),
  )
  expect(await readEntries(stack, account)).toHaveLength(2)

  // ===== Let requests through again, close the sheet and reload. =====
  await page.unroute(ENTRIES_ENDPOINT)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await settled(page)
  await expect(sheet(page)).toHaveCount(0)
  await expect(scrim(page)).toHaveCount(0)

  await page.reload()
  await settled(page)
  await expect(page.locator('[data-entry]')).toHaveCount(2)
  await expect(page.locator('[data-count]')).toHaveAttribute('data-count', '2')
  await expect(cardWith(page, '$300.00')).toHaveCount(1)
  await expect(cardWith(page, '$500.00')).toHaveCount(1)
  expect(await readEntries(stack, account)).toHaveLength(2)

  // ----- The back button does not bring a sheet back: no sheet was left behind
  // in the history by the delete that failed or by the one that succeeded. -----
  await page.goBack()
  await settled(page)
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(new URL(page.url()).hash).not.toContain('entry/')
})
