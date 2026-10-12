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

// Refined board value 8: layout and install hold AFTER the entrances.
//
// Judged only through the declared public port: the built bundle as Chrome loads it
// over the served origin -- the document and its computed layout at several viewport
// widths, the stable data attributes the board fixes (data-box, data-action,
// data-form, data-person-chip, data-pill, data-motion), the same-origin stylesheet
// as it is served, the manifest and the icon bytes, and the service worker
// registration. Nothing here reaches into src/.
//
// The one change from version one's oracle: every measurement is taken at REST.
// Value 7's entrances move cards 28 px and form rows 16 px while data-motion is
// present, and the currency pill slides between the halves of the switch, so a
// screen is measured only once no element carries data-motion, the pressed currency
// pill has arrived over its own half, and the layout has stopped changing.

const PASSWORD_FIELD = 'input[type="password"]'

// The widths the design names: three Android phones and a wide screen.
const WIDTHS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 800, height: 900 },
] as const

const COLUMN_MAX = 560
const MIN_TOUCH = 44
// Sub-pixel layout rounding; a 44 px rule must not fail on 43.98.
const EPSILON = 0.5
// The design fixes 16 px side margins on the phone; allow a little room without
// letting a fixed, narrower-than-the-phone layout through.
const PHONE_SIDE_MARGIN_MAX = 32
// The bottom buttons sit calc(20px + env(safe-area-inset-bottom)) from the bottom;
// headless Chromium reports the inset as 0, so 16 px is the floor that still fails a
// button pinned flat to the edge, where Android's gesture bar would cover it.
const BOTTOM_CLEARANCE_MIN = 16
const THEME_COLOR = '#f4f7f6'

const LAYOUT_ACCOUNT = {
  email: 'owner-layout@abbaas.test',
  password: 'layout-password-8',
} as const

// A person and a few sends and payments, so Home shows a filled box, day labels and
// cards on both halves of the centre line -- the widest Home the board draws.
const SEEDED_PEOPLE = ['Ahmed Shifaz', 'Mariyam Nisha'] as const

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
    SEEDED_PEOPLE,
    [
      {
        kind: 'send',
        currency: 'USD',
        amountMinor: 74000,
        rate: null,
        usdCents: 74000,
        entryDate: '2026-10-05',
        savedAt: '2026-10-05T09:00:00Z',
        personName: 'Mariyam Nisha',
      },
      {
        kind: 'send',
        currency: 'MVR',
        amountMinor: 1540000,
        rate: '15.4000',
        usdCents: 100000,
        entryDate: '2026-10-02',
        savedAt: '2026-10-02T09:00:00Z',
        personName: 'Ahmed Shifaz',
      },
      {
        kind: 'receive',
        currency: 'USD',
        amountMinor: 10000,
        rate: null,
        usdCents: 10000,
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
    const selector = 'button, a, [data-person-chip], [data-square]'
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

/** The Send and Receive buttons stay clear of Android's gesture bar. */
const expectBottomClearance = async (page: Page, label: string): Promise<void> => {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('no viewport')
  for (const action of ['send', 'receive'] as const) {
    const rect = await rectOf(page, `[data-action="${action}"]`)
    expect(
      viewport.height - (rect.y + rect.height),
      `${label}: ${action} button's clearance below it`,
    ).toBeGreaterThanOrEqual(BOTTOM_CLEARANCE_MIN - EPSILON)
  }
}

/**
 * A fingerprint of everything this oracle measures, so "at rest" can be decided from
 * the page itself: the document's scrollable width, and the box of every element the
 * checks look at. Two identical samples a few frames apart mean nothing is moving.
 */
const layoutSignature = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const root = document.documentElement
    const parts = [`${root.scrollWidth}/${root.clientWidth}`]
    const selector =
      '[data-box], [data-action], [data-form], [data-entry], [data-after], [data-row], [data-pill], button, a'
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const rect = element.getBoundingClientRect()
      parts.push(
        `${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`,
      )
    }
    return parts.join('|')
  })

/** Whether the sliding currency pill has arrived over the pressed currency button. */
const pillState = (page: Page, formKind: string): Promise<string> =>
  page.evaluate((kind) => {
    const form = document.querySelector(`[data-form="${kind}"]`)
    if (!form) return 'no form'
    const pill = form.querySelector('[data-pill]')
    if (!pill) return 'no pill'
    const currency = Array.from(form.querySelectorAll('button[aria-pressed]')).filter((button) =>
      ['USD', 'MVR'].includes((button.textContent ?? '').trim()),
    )
    const pressed = currency.filter((button) => button.getAttribute('aria-pressed') === 'true')
    if (pressed.length !== 1) return `pressed currencies: ${pressed.length}`
    const pillBox = pill.getBoundingClientRect()
    const pressedBox = pressed[0]!.getBoundingClientRect()
    const pillCentre = pillBox.left + pillBox.width / 2
    const pressedCentre = pressedBox.left + pressedBox.width / 2
    return Math.abs(pillCentre - pressedCentre) <= 6 ? 'over the pressed half' : 'still sliding'
  }, formKind)

/**
 * Waits until the screen is at rest: no element carries data-motion (value 7's
 * entrances and value 6's save motion are over), the currency pill of a form has
 * reached its pressed half, and the layout has stopped changing between samples.
 */
const settle = async (page: Page, label: string, formKind?: string): Promise<void> => {
  await expect
    .poll(() => page.locator('[data-motion]').count(), {
      timeout: 5_000,
      message: `${label}: every entrance has finished (no data-motion)`,
    })
    .toBe(0)

  if (formKind) {
    await expect
      .poll(() => pillState(page, formKind), {
        timeout: 5_000,
        message: `${label}: the currency pill has reached the pressed half`,
      })
      .toBe('over the pressed half')
  }

  let previous = await layoutSignature(page)
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(120)
        const current = await layoutSignature(page)
        const steady = current === previous
        previous = current
        return steady
      },
      { timeout: 5_000, message: `${label}: the layout has stopped moving` },
    )
    .toBe(true)
}

/**
 * Walks the refined board's screens -- Home, the send form in USD and in MVR, and the
 * receive form -- letting each come to rest before the checks run.
 */
const forEachScreen = async (
  page: Page,
  label: string,
  check: (screen: string) => Promise<void>,
): Promise<void> => {
  await expect(page.locator('[data-box="abbaas"]')).toBeVisible()
  await settle(page, `${label} Home`)
  await check(`${label} Home`)

  await page.locator('[data-action="send"]').click()
  await expect(page.locator('[data-form="send"]')).toBeVisible()
  await settle(page, `${label} send form USD`, 'send')
  await check(`${label} send form USD`)

  // The MVR state opens the rate row, which is the tallest the form gets.
  await page.locator('[data-form="send"]').getByRole('button', { name: 'MVR', exact: true }).click()
  await settle(page, `${label} send form MVR`, 'send')
  await check(`${label} send form MVR`)

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('[data-form="send"]')).toHaveCount(0)

  // Closing a form without saving replays Home's entrance, so Home settles again.
  await expect(page.locator('[data-box="abbaas"]')).toBeVisible()
  await settle(page, `${label} Home after Close`)

  await page.locator('[data-action="receive"]').click()
  await expect(page.locator('[data-form="receive"]')).toBeVisible()
  await settle(page, `${label} receive form`, 'receive')
  await check(`${label} receive form`)

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('[data-form="receive"]')).toHaveCount(0)
  await expect(page.locator('[data-box="abbaas"]')).toBeVisible()
  await settle(page, `${label} Home after Close`)
}

test('at rest, every screen fits the phone from 360 px, caps at a centred 560 px column, clears the gesture bar and keeps 44 px touch targets', async ({
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

    // ----- The column itself, measured on Home at rest. -----
    await settle(page, `${label} Home column`)
    await expectBottomClearance(page, `${label} Home`)
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

// The page colour of the board, which the refined screens keep. The box-amount font
// probe of version one is not repeated here: the refined board splits a filled
// amount across the dollars and a cents span, so the single-leaf probe no longer
// names an element of this board; the board's own screens own that check.
test('the page still paints the board colour under every screen', async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS[0].width, height: WIDTHS[0].height })
  await signIn(page)
  await settle(page, 'Home palette')

  expect(await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(244, 247, 246)',
  )
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
