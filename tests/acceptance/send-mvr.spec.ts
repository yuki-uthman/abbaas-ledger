import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, readEntries, seedPerson, type Account } from '../support/accounts.js'

// Value 4: recording a send in rufiyaa at the rate the owner got that day.
//
// Judged through the declared public port only: the built bundle's DOM (the send
// form's currency buttons, its labelled Amount sent and Rate (MVR per $1) fields,
// the data-usd output, the preview and balance boxes, Home's centre-line entry)
// and, outside the browser, the row the app stored.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 360, height: 780 } as const

const MVR_ACCOUNT = {
  email: 'owner-send-mvr@abbaas.test',
  password: 'send-mvr-password-4',
} as const

const SAVED_PERSON = 'Ahmed Shifaz'

const RATE_LABEL = 'Rate (MVR per $1)'

let stack: Stack
let served: ServedOrigin
let account: Account
let savedPersonId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, MVR_ACCOUNT)
  savedPersonId = await seedPerson(stack, account, SAVED_PERSON)
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

const openSendForm = async (page: Page): Promise<Locator> => {
  await page.locator('[data-action="send"]').click()
  const form = page.locator('[data-form="send"]')
  await expect(form).toBeVisible()
  return form
}

const saveButton = (page: Page): Locator => page.getByRole('button', { name: /^Save entry/ })

/** Types one amount-and-rate pair and reads back the worked-out dollar value. */
const expectWorkedValue = async (
  page: Page,
  amountText: string,
  rateText: string,
  dollars: string,
): Promise<void> => {
  await page.getByLabel('Amount sent').fill(amountText)
  await page.getByLabel(RATE_LABEL).fill(rateText)
  await expect(page.locator('[data-usd]')).toHaveText(dollars)
}

test('an MVR send works the dollar value out as the owner types and stores the amount, the rate and that value', async ({
  page,
}) => {
  await signIn(page)
  await expect(page.locator('[data-entry]')).toHaveCount(0)

  // ----- USD is the opening currency, so the rate field is not there yet. -----
  await openSendForm(page)
  const mvrButton = page.getByRole('button', { name: 'MVR', exact: true })
  const usdButton = page.getByRole('button', { name: 'USD', exact: true })
  await expect(usdButton).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel(RATE_LABEL)).toHaveCount(0)
  await expect(page.locator('[data-usd]')).toHaveCount(0)

  // ----- Switching to MVR reveals the rate field and the dollar value. -----
  await mvrButton.click()
  await expect(mvrButton).toHaveAttribute('aria-pressed', 'true')
  await expect(usdButton).toHaveAttribute('aria-pressed', 'false')

  const rate = page.getByLabel(RATE_LABEL)
  await expect(rate).toBeVisible()
  await expect(rate).toHaveAttribute('inputmode', 'decimal')

  const worked = page.locator('[data-usd]')
  await expect(worked).toBeVisible()

  // With nothing typed yet nothing can be saved and no value is claimed.
  await expect(worked).toHaveText('$0.00')
  await expect(saveButton(page)).toBeDisabled()

  // ----- The dollar value follows every keystroke of amount and rate. -----
  await expectWorkedValue(page, '10,000', '20', '$500.00')

  // The after-saving preview follows the USD value, not the rufiyaa figure.
  const abbaasPreview = page.locator('[data-preview-box="abbaas"]')
  await expect(abbaasPreview).toHaveAttribute('data-state', 'filled')
  await expect(abbaasPreview).toHaveAttribute('data-amount', '50000')
  await expect(page.locator('[data-preview-box="you"]')).toHaveAttribute('data-state', 'empty')

  // Rounding, not truncation: 1 at 8 is 12.5 cents and must read as 13.
  await expectWorkedValue(page, '1', '8', '$0.13')
  await expect(abbaasPreview).toHaveAttribute('data-amount', '13')

  await expectWorkedValue(page, '100', '3', '$33.33')
  await expect(abbaasPreview).toHaveAttribute('data-amount', '3333')

  await expectWorkedValue(page, '15,400', '15.40', '$1,000.00')
  await expect(abbaasPreview).toHaveAttribute('data-amount', '100000')

  // ----- A rate that does not parse claims no value and blocks the save. -----
  await page.getByLabel('Amount sent').fill('10,000')
  await rate.fill('0')
  await expect(worked).toHaveText('$0.00')
  await expect(saveButton(page)).toBeDisabled()

  // ----- Back to the pair the owner means to save. -----
  await expectWorkedValue(page, '10,000', '20', '$500.00')

  const chip = page.locator(`[data-person-chip="${savedPersonId}"]`)
  await expect(chip).toHaveText(SAVED_PERSON)
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')

  const save = saveButton(page)
  await expect(save).toBeEnabled()
  // The button names the dollar value, which is what the balance moves by.
  await expect(save).toHaveAccessibleName(/\$500\.00/)
  await save.click()

  // ----- Home: the entry reads its detail under its USD amount. -----
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)
  const entries = page.locator('[data-entry]')
  await expect(entries).toHaveCount(1)

  // The saved entry and the boxes animate into place; read them only at rest,
  // when nothing in the document is still carrying a motion marker.
  await expect(page.locator('[data-motion]')).toHaveCount(0)

  const entry = entries.first()
  await expect(entry).toContainText('$500.00')
  await expect(entry).toContainText('MVR 10,000 at 20.00')
  await expect(entry).toContainText(SAVED_PERSON)
  const rect = await entry.boundingBox()
  if (!rect) throw new Error('The saved entry has no layout box')
  expect(rect.x).toBeGreaterThanOrEqual(VIEWPORT.width / 2)

  const abbaasBox = page.locator('[data-box="abbaas"]')
  await expect(abbaasBox).toHaveAttribute('data-state', 'filled')
  await expect(abbaasBox).toHaveAttribute('data-amount', '50000')
  await expect(abbaasBox).toContainText('$500.00')
  await expect(page.locator('[data-box="you"]')).toHaveAttribute('data-state', 'empty')

  // ----- What was stored, read outside the browser. -----
  const stored = await readEntries(stack, account)
  expect(stored).toHaveLength(1)
  const row = stored[0]!
  expect(row.kind).toBe('send')
  expect(row.currency).toBe('MVR')
  // Laari, not cents: storing the dollar value here would read 50000.
  expect(row.amount_minor).toBe(1000000)
  expect(Number(row.rate)).toBe(20)
  expect(row.usd_cents).toBe(50000)
  expect(row.person_id).toBe(savedPersonId)
  expect(row.person_name).toBe(SAVED_PERSON)

  // ----- A newly opened form is USD again, with no rate field. -----
  await openSendForm(page)
  await expect(page.getByRole('button', { name: 'USD', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByLabel(RATE_LABEL)).toHaveCount(0)
  await expect(page.locator('[data-usd]')).toHaveCount(0)

  // Switching to MVR and back keeps the typed amount and reads it as dollars.
  await page.getByRole('button', { name: 'MVR', exact: true }).click()
  await page.getByLabel('Amount sent').fill('250')
  await page.getByLabel(RATE_LABEL).fill('20')
  await expect(page.locator('[data-usd]')).toHaveText('$12.50')
  await page.getByRole('button', { name: 'USD', exact: true }).click()
  await expect(page.getByLabel(RATE_LABEL)).toHaveCount(0)
  await expect(page.locator('[data-usd]')).toHaveCount(0)
  await expect(page.getByLabel('Amount sent')).toHaveValue('250')
  await expect(page.locator('[data-preview-box="abbaas"]')).toHaveAttribute(
    'data-amount',
    '75000',
  )
})
