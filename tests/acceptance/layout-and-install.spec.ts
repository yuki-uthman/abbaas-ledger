import { test, expect, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, seedHistory, type Account } from '../support/accounts.js'

// Value 8: phone layout, the wide-screen column and Android install.
//
// Judged only through the declared public port: the built bundle as Chrome loads it
// over the served origin -- the document and its computed layout at several
// viewport widths, the stable data attributes earlier values fixed (data-box,
// data-action, data-entry, data-form, data-person-chip, data-quick), the same-origin
// stylesheet as it is served, the manifest and the icon bytes, and the service
// worker registration. Nothing here reaches into src/.

const PASSWORD_FIELD = 'input[type="password"]'

// The widths the design names: two Android phones and a wide screen.
const WIDTHS = [
  { width: 360, height: 780 },
  { width: 412, height: 915 },
  { width: 1024, height: 800 },
] as const

const COLUMN_MAX = 560
const MIN_TOUCH = 44
// Sub-pixel layout rounding; a 44 px rule must not fail on 43.98.
const EPSILON = 0.5
// The design fixes 16 px side margins on the phone; allow a little room without
// letting a fixed, narrower-than-the-phone layout through.
const PHONE_SIDE_MARGIN_MAX = 32
const PAGE_BACKGROUND = 'rgb(244, 247, 246)'
const THEME_COLOR = '#f4f7f6'

const LAYOUT_ACCOUNT = {
  email: 'owner-layout@abbaas.test',
  password: 'layout-password-8',
} as const

// A balance Abbaas holds, so Home shows a filled box with a real amount to measure
// the box-amount font on: $740.00 sent minus $100.00 paid back is $640.00.
const SEEDED_PERSON = 'Mariyam Nisha'
const SEND_CENTS = 74000
const RECEIVE_CENTS = 10000
const BALANCE_TEXT = '$640.00'

let stack: Stack
let served: ServedOrigin
let account: Account

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
  account = await createAccount(stack, LAYOUT_ACCOUNT)
  await seedHistory(
    stack,
    account,
    [SEEDED_PERSON],
    [
      {
        kind: 'send',
        currency: 'USD',
        amountMinor: SEND_CENTS,
        rate: null,
        usdCents: SEND_CENTS,
        entryDate: '2026-10-05',
        savedAt: '2026-10-05T09:00:00Z',
        personName: SEEDED_PERSON,
      },
      {
        kind: 'receive',
        currency: 'USD',
        amountMinor: RECEIVE_CENTS,
        rate: null,
        usdCents: RECEIVE_CENTS,
        entryDate: '2026-10-08',
        savedAt: '2026-10-08T09:00:00Z',
      },
    ],
  )
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

type Rect = { x: number; y: number; width: number; height: number }

const rectOf = async (page: Page, selector: string): Promise<Rect> => {
  const locator = page.locator(selector)
  await expect(locator).toBeVisible()
  const rect = await locator.boundingBox()
  if (!rect) throw new Error(`${selector} has no layout box`)
  return rect
}

/**
 * The horizontal extent the app actually occupies, measured only from elements the
 * earlier values' attribute contract names: the two balance boxes and the two bottom
 * buttons, which the design puts inside the column.
 */
const occupiedSpan = async (page: Page): Promise<{ left: number; right: number }> => {
  const rects = await Promise.all(
    ['[data-box="you"]', '[data-box="abbaas"]', '[data-action="send"]', '[data-action="receive"]'].map(
      (selector) => rectOf(page, selector),
    ),
  )
  return {
    left: Math.min(...rects.map((rect) => rect.x)),
    right: Math.max(...rects.map((rect) => rect.x + rect.width)),
  }
}

/** The page never scrolls sideways, and no visible element escapes the viewport. */
const expectNoHorizontalOverflow = async (page: Page, label: string): Promise<void> => {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    const limit = root.clientWidth
    const escapes: string[] = []
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const style = window.getComputedStyle(element)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (rect.right > limit + 1 || rect.left < -1) {
        escapes.push(`${element.tagName.toLowerCase()} ${Math.round(rect.left)}..${Math.round(rect.right)}`)
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth: limit, escapes: escapes.slice(0, 5) }
  })

  expect(overflow.escapes, `${label}: elements escaping the viewport`).toEqual([])
  expect(overflow.scrollWidth, `${label}: horizontal scrolling`).toBeLessThanOrEqual(overflow.clientWidth)
}

/** Every control a thumb must hit is at least 44 px tall. */
const expectTouchTargets = async (page: Page, label: string): Promise<void> => {
  const small = await page.evaluate((minimum) => {
    const selector = 'button, a, [data-person-chip], [data-quick], [data-square]'
    const offenders: string[] = []
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const style = window.getComputedStyle(element)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (rect.height < minimum) {
        offenders.push(
          `${element.tagName.toLowerCase()}[${(element.textContent ?? '').trim().slice(0, 24)}]=${rect.height.toFixed(1)}`,
        )
      }
    }
    return offenders.slice(0, 8)
  }, MIN_TOUCH - EPSILON)

  expect(small, `${label}: controls shorter than ${MIN_TOUCH} px`).toEqual([])
}

/** Walks Home, the send form and the receive form, applying the same checks to each. */
const forEachScreen = async (
  page: Page,
  label: string,
  check: (screen: string) => Promise<void>,
): Promise<void> => {
  await expect(page.locator('[data-box="abbaas"]')).toBeVisible()
  await check(`${label} Home`)

  await page.locator('[data-action="send"]').click()
  await expect(page.locator('[data-form="send"]')).toBeVisible()
  await check(`${label} send form`)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)

  await page.locator('[data-action="receive"]').click()
  await expect(page.locator('[data-form="receive"]')).toBeVisible()
  await check(`${label} receive form`)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
}

test('every screen fits the phone from 360 px, caps at a centred 560 px column, and keeps 44 px touch targets', async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDTHS[0].width, height: WIDTHS[0].height })
  await signIn(page)

  for (const viewport of WIDTHS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const label = `${viewport.width}x${viewport.height}`

    await forEachScreen(page, label, async (screen) => {
      await expectNoHorizontalOverflow(page, screen)
      await expectTouchTargets(page, screen)
    })

    // ----- The column itself, measured on Home. -----
    const span = await occupiedSpan(page)
    const leftMargin = span.left
    const rightMargin = viewport.width - span.right
    const columnWidth = span.right - span.left

    if (viewport.width <= 412) {
      // A phone: the app fills the width but for its side margins, so a layout
      // pinned to some other phone's width fails here.
      expect(leftMargin, `${label}: left margin`).toBeLessThanOrEqual(PHONE_SIDE_MARGIN_MAX)
      expect(rightMargin, `${label}: right margin`).toBeLessThanOrEqual(PHONE_SIDE_MARGIN_MAX)
      expect(leftMargin, `${label}: left margin`).toBeGreaterThanOrEqual(0)
      expect(rightMargin, `${label}: right margin`).toBeGreaterThanOrEqual(0)
    } else {
      // A wide screen: a centred column, no wider than 560 px.
      expect(columnWidth, `${label}: column width`).toBeLessThanOrEqual(COLUMN_MAX + EPSILON)
      expect(Math.abs(leftMargin - rightMargin), `${label}: margins differ`).toBeLessThanOrEqual(2)
      // The bottom buttons live inside that column, not pinned to the screen edges.
      const send = await rectOf(page, '[data-action="send"]')
      const receive = await rectOf(page, '[data-action="receive"]')
      expect(send.x, `${label}: Send left of the column`).toBeGreaterThanOrEqual(span.left - EPSILON)
      expect(receive.x + receive.width, `${label}: Receive right of the column`).toBeLessThanOrEqual(
        span.right + EPSILON,
      )
    }
  }

  // ===== The bottom controls are offset by the gesture-bar inset. =====
  // Headless Chromium reports every safe-area inset as 0, so the inset is judged on
  // the stylesheet the origin actually serves, which is the shipped artefact.
  const cssHrefs = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href).filter((href) => href.startsWith(window.location.origin)),
    )
  expect(cssHrefs.length, 'the bundle serves its own stylesheet').toBeGreaterThan(0)

  const stylesheets = await Promise.all(
    cssHrefs.map(async (href) => {
      const response = await page.request.get(href)
      expect(response.status(), `${href} status`).toBe(200)
      return response.text()
    }),
  )
  expect(stylesheets.some((css) => css.includes('env(safe-area-inset-bottom)'))).toBe(true)
})

test('the palette and fonts of the final canvas are the ones the browser computes', async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS[0].width, height: WIDTHS[0].height })
  await signIn(page)

  expect(await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor)).toBe(
    PAGE_BACKGROUND,
  )

  // The box amount is the innermost element inside the filled box that reads the
  // balance; the design sets Manrope on it.
  const abbaas = page.locator('[data-box="abbaas"]')
  await expect(abbaas).toContainText(BALANCE_TEXT)
  const amountFont = await abbaas.evaluate((box, amountText) => {
    const candidates = Array.from(box.querySelectorAll('*')).filter(
      (element) => element.children.length === 0 && (element.textContent ?? '').trim() === amountText,
    )
    const target = candidates[candidates.length - 1] ?? box
    return window.getComputedStyle(target).fontFamily
  }, BALANCE_TEXT)
  expect(amountFont.replace(/["']/g, '')).toMatch(/^Manrope/)
})

test('Chrome can add the app to the home screen: manifest, icons, theme colour and a service worker', async ({
  page,
}) => {
  await page.goto(ORIGIN)

  // ----- The document declares the install surface. -----
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .first()
    .evaluate((link) => (link as HTMLLinkElement).href)
  expect(manifestHref).toContain('manifest.webmanifest')

  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', THEME_COLOR)
  const appleIcon = await page
    .locator('link[rel="apple-touch-icon"]')
    .first()
    .evaluate((link) => (link as HTMLLinkElement).href)
  expect(appleIcon).toContain('icons/icon-192.png')

  // ----- The manifest, as the origin serves it. -----
  const manifestResponse = await page.request.get(manifestHref)
  expect(manifestResponse.status()).toBe(200)
  const manifest = JSON.parse(await manifestResponse.text()) as {
    name?: string
    short_name?: string
    display?: string
    start_url?: string
    scope?: string
    background_color?: string
    theme_color?: string
    icons?: ReadonlyArray<{ src?: string; sizes?: string; type?: string; purpose?: string }>
  }

  expect(manifest.name).toBe('Abbaas Ledger')
  expect(manifest.short_name).toBe('Ledger')
  // Standalone is what drops the browser bar on the home-screen launch.
  expect(manifest.display).toBe('standalone')
  // Relative, so the app installs from the GitHub Pages sub-path too.
  expect(manifest.start_url).toBe('.')
  expect(manifest.scope).toBe('.')
  expect(manifest.background_color).toBe(THEME_COLOR)
  expect(manifest.theme_color).toBe(THEME_COLOR)

  const icons = manifest.icons ?? []
  const sizes = icons.map((icon) => icon.sizes)
  expect(sizes).toContain('192x192')
  expect(sizes).toContain('512x512')
  expect(
    icons.some((icon) => (icon.purpose ?? '').split(/\s+/).includes('maskable')),
    'one icon is maskable, so Android may shape it',
  ).toBe(true)

  // ----- Every declared icon really answers with a PNG of its declared size. -----
  for (const icon of icons) {
    expect(icon.src, 'every icon names a source').toBeTruthy()
    expect(icon.type).toBe('image/png')
    const iconUrl = new URL(icon.src!, manifestHref).toString()
    const response = await page.request.get(iconUrl)
    expect(response.status(), `${icon.src} status`).toBe(200)
    expect(response.headers()['content-type'], `${icon.src} type`).toContain('image/png')

    // The PNG header carries the pixel size, so a placeholder of the wrong size or
    // the single-page HTML fallback cannot pass as an icon.
    const bytes = await response.body()
    expect(
      Array.from(bytes.subarray(0, 8)),
      `${icon.src} is a PNG`,
    ).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const pixelWidth = bytes.readUInt32BE(16)
    const pixelHeight = bytes.readUInt32BE(20)
    expect(`${pixelWidth}x${pixelHeight}`, `${icon.src} pixels`).toBe(icon.sizes)
  }

  // ----- A service worker is registered, which is what makes Chrome offer install. -----
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 'unsupported'
          const registration = await navigator.serviceWorker.getRegistration()
          return registration ? 'registered' : 'none'
        }),
      { timeout: 15_000, message: 'a service worker registration after load' },
    )
    .toBe('registered')

  // The page still works as an ordinary web page: registration never breaks sign-in.
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
})
