import { test, expect, type Browser, type Page } from '@playwright/test'
import {
  ORIGIN,
  buildBundle,
  serveDist,
  startLocalStack,
  type ServedOrigin,
  type Stack,
} from '../support/local-stack.js'
import { createAccount, seedHistory, type Account } from '../support/accounts.js'

// Refined board value 7: the entrances. Opening the app plays Home's entrance - the
// boxes rise, the balance counts up from $0, the centre line draws down and the
// entries slide in from their own sides - and opening a form ripples the tapped
// button and rises the form's rows in one after another. With prefers-reduced-motion
// none of it runs and every screen shows its end state from the first frame.
//
// Judged through the declared public port only: the built bundle's DOM OVER TIME, at
// the refined board's 390 by 844 viewport, with and without reduced motion. The
// oracle reads nothing but the attributes the design fixed - data-motion
// ('home-enter' on Home's root while the entrance runs), data-spine on the centre
// line, data-ripple on the tap ripple, data-row on a form's rows - and the computed
// transform and opacity of the elements those attributes name, plus the box text and
// data-amount of version one's contract. No new attribute is introduced here.
//
// Two transient states cannot be caught by a round-trip assertion, so frames are
// recorded inside the page with requestAnimationFrame and judged afterwards. Home's
// entrance begins the moment Home mounts after a load, which is before any evaluate
// the test could issue, so the recorder starts itself at document start on every
// navigation and the test collects the buffer afterwards. The tap on Send is recorded
// on demand, from the tap.
//
// Not judged here: the exact per-element delays and durations inside the entrance
// (320/460 ms boxes, 70 ms apart entries, 640 ms spine) carry no public marker of
// their own; the oracle judges what the observation states - the direction each thing
// moves from, that the amount really counts rather than jumps, that the rows rise one
// after another and not all at once, and that everything is over inside the budget.

const PASSWORD_FIELD = 'input[type="password"]'
const VIEWPORT = { width: 390, height: 844 } as const

// Each test drives its own first open, so each needs its own account: sharing one
// would leave the second test looking at the first one's session and end state.
const OPEN_ACCOUNT = {
  email: 'owner-entrances-open@abbaas.test',
  password: 'entrances-password-7',
} as const
const REDUCED_ACCOUNT = {
  email: 'owner-entrances-reduced@abbaas.test',
  password: 'entrances-password-7',
} as const

// The seeded ledger: a $500.00 send to Mariyam Nisha yesterday and a $200.00 payment
// today, so Abbaas holds $300.00, one card lies on each side of the centre line, and
// the balance the entrance counts up to is not the amount of any single entry.
const SEEDED_PERSON = 'Mariyam Nisha'
const SEND_CENTS = 50000
const SEND_TEXT = '$500.00'
const RECEIVE_CENTS = 20000
const RECEIVE_TEXT = '$200.00'
const HELD_CENTS = SEND_CENTS - RECEIVE_CENTS
const HELD_TEXT = '$300.00'

// The design caps Home's entrance at 1.6 s and the form's rows finish 240 ms after
// the reveal plus the stagger and the rise, well inside 1.2 s of the tap.
const HOME_ENTER_LIMIT_MS = 1_600
const ROWS_LIMIT_MS = 1_200
// The load recording must cover the session resolving, the ledger read and the whole
// entrance; the tap recording only the form's opening.
const LOAD_WINDOW_MS = 6_000
const TAP_WINDOW_MS = 2_500
// The board's rows: amount, paid to, date and the save button at the least.
const MIN_ROWS = 4
// The ripple is a 120 px circle at the tapped button's centre; a scale about that
// centre leaves it where it was, so a generous tolerance still pins it to the button.
const RIPPLE_TOLERANCE_PX = 30

let stack: Stack
let served: ServedOrigin

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  stack = startLocalStack()
  buildBundle(stack)
  served = await serveDist()
})

test.afterAll(async () => {
  await served?.close()
})

/** A date the given number of days before today, in the device's own time zone. */
const localDate = (daysAgo: number): string => {
  const day = new Date()
  day.setDate(day.getDate() - daysAgo)
  const month = `${day.getMonth() + 1}`.padStart(2, '0')
  const date = `${day.getDate()}`.padStart(2, '0')
  return `${day.getFullYear()}-${month}-${date}`
}

/**
 * A fresh account holding the two seeded entries, so each test opens the same Home
 * whether it runs alone or after another.
 */
const freshSeededAccount = async (credentials: {
  readonly email: string
  readonly password: string
}): Promise<Account> => {
  const created = await createAccount(stack, credentials)
  const yesterday = localDate(1)
  const today = localDate(0)
  await seedHistory(
    stack,
    created,
    [SEEDED_PERSON],
    [
      {
        kind: 'send',
        currency: 'USD',
        amountMinor: SEND_CENTS,
        rate: null,
        usdCents: SEND_CENTS,
        entryDate: yesterday,
        savedAt: `${yesterday}T09:00:00.000Z`,
        personName: SEEDED_PERSON,
      },
      {
        kind: 'receive',
        currency: 'USD',
        amountMinor: RECEIVE_CENTS,
        rate: null,
        usdCents: RECEIVE_CENTS,
        entryDate: today,
        savedAt: `${today}T09:00:00.000Z`,
      },
    ],
  )
  return created
}

// ---------------------------------------------------------------------------
// The in-page frame recorder. One sample per animation frame of the public
// attributes and of the computed transform and opacity of the elements they name.
// ---------------------------------------------------------------------------

type BoxSample = {
  readonly motion: string | null
  readonly amount: string | null
  readonly state: string | null
  readonly text: string
  readonly transform: string
  readonly opacity: number
}

type EntrySample = {
  readonly text: string
  readonly transform: string
  readonly opacity: number
}

type RowSample = {
  readonly top: number
  readonly opacity: number
}

type RippleSample = {
  readonly x: number
  readonly y: number
  readonly ariaHidden: string | null
}

type Frame = {
  readonly t: number
  /** Every data-motion value present anywhere in the document at this frame. */
  readonly motions: readonly string[]
  /** The data-form values mounted at this frame; empty while Home is shown. */
  readonly formKinds: readonly string[]
  readonly you: BoxSample | null
  readonly abbaas: BoxSample | null
  /** The centre line, when it is in the document. */
  readonly spine: { readonly transform: string } | null
  readonly entries: readonly EntrySample[]
  /** The bottom buttons, in document order: Send then Receive. */
  readonly actions: readonly EntrySample[]
  /** The form's rows, in document order. */
  readonly rows: readonly RowSample[]
  readonly ripples: readonly RippleSample[]
}

declare global {
  interface Window {
    /** Records on demand, from the moment the test asks: used for the tap on Send. */
    __recordEntranceFrames: (durationMs: number) => Promise<unknown[]>
    /** Starts itself at document start on every navigation: used for the load. */
    __entranceLoadRecording: Promise<unknown[]>
  }
}

const installRecorder = async (page: Page): Promise<void> => {
  await page.addInitScript(
    ([loadWindowMs]: readonly number[]) => {
      const clean = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim()

      const boxOf = (selector: string): unknown => {
        const element = document.querySelector(selector)
        if (!element) return null
        const style = getComputedStyle(element)
        return {
          motion: element.getAttribute('data-motion'),
          amount: element.getAttribute('data-amount'),
          state: element.getAttribute('data-state'),
          text: clean(element.textContent),
          transform: style.transform,
          opacity: Number(style.opacity),
        }
      }

      const movers = (selector: string): unknown[] =>
        Array.from(document.querySelectorAll(selector), (element) => {
          const style = getComputedStyle(element)
          return {
            text: clean(element.textContent),
            transform: style.transform,
            opacity: Number(style.opacity),
          }
        })

      const tickFrame = (startedAt: number): unknown => {
        const spine = document.querySelector('[data-spine]')
        return {
          t: performance.now() - startedAt,
          motions: Array.from(
            document.querySelectorAll('[data-motion]'),
            (element) => element.getAttribute('data-motion') ?? '',
          ),
          formKinds: Array.from(
            document.querySelectorAll('[data-form]'),
            (element) => element.getAttribute('data-form') ?? '',
          ),
          you: boxOf('[data-box="you"]'),
          abbaas: boxOf('[data-box="abbaas"]'),
          spine: spine ? { transform: getComputedStyle(spine).transform } : null,
          entries: movers('[data-entry]'),
          actions: movers('[data-action]'),
          rows: Array.from(document.querySelectorAll('[data-row]'), (element) => ({
            top: element.getBoundingClientRect().top,
            opacity: Number(getComputedStyle(element).opacity),
          })),
          ripples: Array.from(document.querySelectorAll('[data-ripple]'), (element) => {
            const box = element.getBoundingClientRect()
            return {
              x: box.left + box.width / 2,
              y: box.top + box.height / 2,
              ariaHidden: element.getAttribute('aria-hidden'),
            }
          }),
        }
      }

      const record = (durationMs: number): Promise<unknown[]> =>
        new Promise((resolve) => {
          const frames: unknown[] = []
          const startedAt = performance.now()
          const tick = (): void => {
            frames.push(tickFrame(startedAt))
            if (performance.now() - startedAt < durationMs) requestAnimationFrame(tick)
            else resolve(frames)
          }
          requestAnimationFrame(tick)
        })

      window.__recordEntranceFrames = record
      // Starts now, at document start, so the first frame Home ever paints is caught.
      window.__entranceLoadRecording = record(loadWindowMs!)
    },
    [LOAD_WINDOW_MS] as const,
  )
}

/** The frames recorded from document start of the current navigation. */
const loadFrames = async (page: Page): Promise<readonly Frame[]> =>
  (await page.evaluate(() => window.__entranceLoadRecording)) as readonly Frame[]

/** Starts an on-demand recording; awaiting the handle yields its frames. */
const startRecording = (page: Page): Promise<readonly Frame[]> =>
  page.evaluate((ms) => window.__recordEntranceFrames(ms), TAP_WINDOW_MS) as Promise<
    readonly Frame[]
  >

// ---------------------------------------------------------------------------
// Reading the recording
// ---------------------------------------------------------------------------

const centsOf = (text: string): number | null => {
  const found = /\$([\d,]+)(?:\.(\d{2}))?/.exec(text)
  if (!found) return null
  const dollars = Number(found[1]!.replace(/,/g, ''))
  const cents = Number(found[2] ?? '0')
  return dollars * 100 + cents
}

/** The six numbers of a computed 2-D transform, or null when it is unreadable. */
const matrixOf = (transform: string): readonly number[] | null => {
  if (transform === 'none') return [1, 0, 0, 1, 0, 0]
  const flat = /^matrix\(([^)]+)\)$/.exec(transform)
  if (flat) return flat[1]!.split(',').map(Number)
  const three = /^matrix3d\(([^)]+)\)$/.exec(transform)
  if (three) {
    const values = three[1]!.split(',').map(Number)
    return [values[0]!, values[1]!, values[4]!, values[5]!, values[12]!, values[13]!]
  }
  return null
}

/** The x translation a computed transform applies, or null when unreadable. */
const translationX = (transform: string): number | null => {
  const matrix = matrixOf(transform)
  return matrix ? matrix[4]! : null
}

/** The y translation a computed transform applies, or null when unreadable. */
const translationY = (transform: string): number | null => {
  const matrix = matrixOf(transform)
  return matrix ? matrix[5]! : null
}

/** The y scale a computed transform applies, or null when unreadable. */
const scaleY = (transform: string): number | null => {
  const matrix = matrixOf(transform)
  return matrix ? matrix[3]! : null
}

const framesWith = (frames: readonly Frame[], motion: string): readonly Frame[] =>
  frames.filter((frame) => frame.motions.includes(motion))

/** The entry sample whose text holds `amount`, at the given frame. */
const entryIn = (frame: Frame, amount: string): EntrySample | undefined =>
  frame.entries.find((entry) => entry.text.includes(amount))

/**
 * The first displacement the named card is seen with: the first frame at which it is
 * in the document and its transform moves it off where it rests. A card that is never
 * displaced is a card that never slid in, which is a failure the caller reports.
 */
const firstShift = (frames: readonly Frame[], amount: string): number | null => {
  for (const frame of frames) {
    const entry = entryIn(frame, amount)
    if (!entry) continue
    const shift = translationX(entry.transform)
    if (shift !== null && Math.abs(shift) > 0.5) return shift
  }
  return null
}

/** The last frame at which the named selector's sample was present. */
const lastFrameWith = <T>(
  frames: readonly Frame[],
  read: (frame: Frame) => T | null | undefined,
): T => {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const found = read(frames[index]!)
    if (found !== null && found !== undefined) return found
  }
  throw new Error('no frame of the recording held that element')
}

const signIn = async (page: Page, account: Account): Promise<void> => {
  await page.goto(ORIGIN)
  await expect(page.locator(PASSWORD_FIELD)).toBeVisible()
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator(PASSWORD_FIELD)).toHaveCount(0)
  await expect(page.locator('[data-box="abbaas"]')).toContainText(HELD_TEXT)
}

/** A phone-sized context on the refined board's viewport, optionally reduced-motion. */
const openPhone = async (
  browser: Browser,
  options?: { readonly reduce: boolean },
): Promise<{ readonly page: Page; readonly close: () => Promise<void> }> => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ...(options?.reduce ? { reducedMotion: 'reduce' as const } : {}),
  })
  const page = await context.newPage()
  await installRecorder(page)
  return { page, close: () => context.close() }
}

/**
 * Reloads Home and returns every frame from document start, so the whole entrance -
 * which begins the moment Home mounts - is in the recording.
 */
const reloadAndRecord = async (page: Page): Promise<readonly Frame[]> => {
  await page.reload()
  const frames = await loadFrames(page)
  expect(
    frames.filter((frame) => frame.abbaas !== null).length,
    'Home never appeared within the recording window after the reload',
  ).toBeGreaterThan(0)
  return frames
}

// ===========================================================================
// Without reduced motion: Home's entrance on open, then the form's rows.
// ===========================================================================

test("opening the app rises the boxes, counts the balance up from $0, draws the centre line down and slides each entry in from its own side", async ({
  browser,
}: {
  browser: Browser
}) => {
  const account = await freshSeededAccount(OPEN_ACCOUNT)
  const phone = await openPhone(browser)
  const page = phone.page
  try {
    await signIn(page, account)

    // ===== Opening the app: Home's entrance, recorded from document start. =====
    const frames = await reloadAndRecord(page)

    const entering = framesWith(frames, 'home-enter')
    expect(
      entering.length,
      "Home's root never carried data-motion=\"home-enter\" on opening the app",
    ).toBeGreaterThan(0)

    // ----- The balance counts up from $0 to what Abbaas holds. -----
    const shown = entering
      .filter((frame) => frame.abbaas !== null)
      .map((frame) => ({ t: frame.t, box: frame.abbaas! }))
    expect(shown.length, 'the abbaas box was absent for the whole entrance').toBeGreaterThan(0)

    for (const { box } of shown) {
      expect(
        box.amount,
        'a box in mid-entrance did not already hold its final data-amount',
      ).toBe(String(HELD_CENTS))
      const figure = centsOf(box.text)
      expect(figure, `a box in mid-entrance showed no amount: ${box.text}`).not.toBeNull()
      // The count travels from $0 up to the balance and never outside that range.
      expect(figure!).toBeGreaterThanOrEqual(0)
      expect(figure!).toBeLessThanOrEqual(HELD_CENTS)
    }
    expect(
      shown.some(({ box }) => (centsOf(box.text) ?? HELD_CENTS) < HELD_CENTS),
      'the balance jumped straight to $300.00 instead of counting up from $0',
    ).toBe(true)

    // ----- The boxes rise into place: displaced on the way, resting at the end. -----
    expect(
      shown.some(({ box }) => (translationY(box.transform) ?? 0) > 0.5),
      'the abbaas box never rose into place during the entrance',
    ).toBe(true)
    const youRose = entering
      .filter((frame) => frame.you !== null)
      .some((frame) => (translationY(frame.you!.transform) ?? 0) > 0.5)
    expect(youRose, 'the you box never rose into place during the entrance').toBe(true)

    // ----- The centre line draws down: scaled in Y on the way, whole at the end. -----
    const spines = entering.filter((frame) => frame.spine !== null)
    expect(
      spines.length,
      'no data-spine element was in the document during the entrance',
    ).toBeGreaterThan(0)
    expect(
      spines.some((frame) => {
        const scale = scaleY(frame.spine!.transform)
        return scale !== null && scale < 0.99
      }),
      'the centre line never had a Y scale below 1: it did not draw down',
    ).toBe(true)
    const restingSpine = lastFrameWith(frames, (frame) => frame.spine)
    const restingScale = scaleY(restingSpine.transform)
    expect(
      restingScale,
      `the centre line's resting transform was unreadable: ${restingSpine.transform}`,
    ).not.toBeNull()
    expect(restingScale!, 'the centre line did not finish at its full height').toBeCloseTo(1, 2)

    // ----- Each entry slides in from its own side. -----
    const sendShift = firstShift(frames, SEND_TEXT)
    expect(sendShift, 'the send card never slid in: it was never displaced').not.toBeNull()
    expect(
      sendShift!,
      'the send card did not slide in from its own side (the left)',
    ).toBeLessThan(0)

    const receiveShift = firstShift(frames, RECEIVE_TEXT)
    expect(receiveShift, 'the payment card never slid in: it was never displaced').not.toBeNull()
    expect(
      receiveShift!,
      'the payment card did not slide in from its own side (the right)',
    ).toBeGreaterThan(0)

    // ----- The bottom buttons rise into place. -----
    expect(
      entering.some((frame) =>
        frame.actions.some((action) => (translationY(action.transform) ?? 0) > 0.5),
      ),
      'the bottom buttons never rose into place during the entrance',
    ).toBe(true)

    // ----- The whole entrance is over inside 1.6 s of its first frame. -----
    const began = entering[0]!.t
    const settled = frames.filter(
      (frame) => frame.t - began <= HOME_ENTER_LIMIT_MS && frame.motions.length === 0,
    )
    expect(
      settled.length,
      `data-motion was still set ${HOME_ENTER_LIMIT_MS} ms after the entrance began`,
    ).toBeGreaterThan(0)

    // ----- The end state. -----
    await expect(page.locator('[data-motion]')).toHaveCount(0)
    await expect(page.locator('[data-ripple]')).toHaveCount(0)
    const abbaasBox = page.locator('[data-box="abbaas"]')
    await expect(abbaasBox).toHaveAttribute('data-amount', String(HELD_CENTS))
    await expect(abbaasBox).toContainText(HELD_TEXT)
    await expect(page.locator('[data-entry]')).toHaveCount(2)

    // ===== Opening Send: the ripple on the button, then the rows rising in. =====
    const sendButton = page.locator('[data-action="send"]')
    const rect = await sendButton.boundingBox()
    if (!rect) throw new Error('The Send button has no layout box')
    const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }

    const tapFrames = await (async () => {
      const recording = startRecording(page)
      await sendButton.click()
      return recording
    })()

    // ----- A ripple shows at the tapped button's centre. -----
    const rippled = tapFrames.flatMap((frame) => frame.ripples)
    expect(rippled.length, 'no data-ripple element appeared on tapping Send').toBeGreaterThan(0)
    const nearest = rippled.reduce((best, candidate) =>
      Math.hypot(candidate.x - centre.x, candidate.y - centre.y) <
      Math.hypot(best.x - centre.x, best.y - centre.y)
        ? candidate
        : best,
    )
    expect(
      Math.abs(nearest.x - centre.x),
      `the ripple's centre x was ${nearest.x}, the Send button's ${centre.x}`,
    ).toBeLessThanOrEqual(RIPPLE_TOLERANCE_PX)
    expect(
      Math.abs(nearest.y - centre.y),
      `the ripple's centre y was ${nearest.y}, the Send button's ${centre.y}`,
    ).toBeLessThanOrEqual(RIPPLE_TOLERANCE_PX)
    expect(nearest.ariaHidden, 'the ripple was not hidden from assistive technology').toBe('true')

    // ----- The form's rows rise in one after another, not all at once. -----
    const withRows = tapFrames.filter((frame) => frame.rows.length >= MIN_ROWS)
    expect(
      withRows.length,
      `the form never held at least ${MIN_ROWS} data-row elements`,
    ).toBeGreaterThan(0)

    expect(
      withRows.some((frame) => frame.rows.filter((row) => row.opacity < 0.99).length >= MIN_ROWS),
      'no frame showed at least four rows still fading in: the rows appeared all at once',
    ).toBe(true)

    // The rows are judged in document order, which is their order down the form.
    const rowCount = withRows[0]!.rows.length
    const tops = withRows[withRows.length - 1]!.rows.map((row) => row.top)
    for (let index = 1; index < tops.length; index += 1) {
      expect(
        tops[index]!,
        'the data-row elements are not in top-to-bottom document order',
      ).toBeGreaterThanOrEqual(tops[index - 1]! - 1)
    }

    const fullAt = (index: number): number | null => {
      for (const frame of withRows) {
        const row = frame.rows[index]
        if (row && row.opacity >= 0.99) return frame.t
      }
      return null
    }
    const arrivals: number[] = []
    for (let index = 0; index < rowCount; index += 1) {
      const at = fullAt(index)
      expect(at, `row ${index} never reached opacity 1 within the recording`).not.toBeNull()
      arrivals.push(at!)
    }
    for (let index = 1; index < arrivals.length; index += 1) {
      expect(
        arrivals[index]!,
        `row ${index} finished rising before the row above it: the rows are not staggered top to bottom`,
      ).toBeGreaterThanOrEqual(arrivals[index - 1]!)
    }
    expect(
      arrivals[arrivals.length - 1]!,
      'every row reached full opacity at the same moment: they did not rise one after another',
    ).toBeGreaterThan(arrivals[0]!)

    // ----- Inside 1.2 s of the tap every row rests and nothing is still moving. -----
    const rowsSettled = withRows.filter(
      (frame) =>
        frame.t <= ROWS_LIMIT_MS &&
        frame.rows.every((row) => row.opacity >= 0.99) &&
        frame.ripples.length === 0 &&
        frame.motions.length === 0,
    )
    expect(
      rowsSettled.length,
      `a row, the ripple or a data-motion was still there ${ROWS_LIMIT_MS} ms after the tap`,
    ).toBeGreaterThan(0)

    await expect(page.locator('[data-form="send"]')).toBeVisible()
    await expect(page.locator('[data-motion]')).toHaveCount(0)
    await expect(page.locator('[data-ripple]')).toHaveCount(0)
  } finally {
    await phone.close()
  }
})

// ===========================================================================
// With prefers-reduced-motion: reduce, every screen shows its end state at once.
// ===========================================================================

test('with reduced motion opening the app and opening a form show their end state from the first frame', async ({
  browser,
}: {
  browser: Browser
}) => {
  const account = await freshSeededAccount(REDUCED_ACCOUNT)
  const phone = await openPhone(browser, { reduce: true })
  const page = phone.page
  try {
    await signIn(page, account)

    // ===== Opening the app plays nothing at all. =====
    const frames = await reloadAndRecord(page)

    expect(
      frames.flatMap((frame) => frame.motions),
      'data-motion was set with reduced motion on opening the app',
    ).toEqual([])
    expect(
      frames.filter((frame) => frame.ripples.length > 0).map((frame) => frame.t),
      'a data-ripple element appeared with reduced motion',
    ).toEqual([])

    // The first frame Home is shown is already its end state: the balance is the one
    // Abbaas holds, and nothing is displaced, scaled or transparent.
    const homeFrames = frames.filter(
      (frame) => frame.abbaas !== null && frame.entries.length === 2,
    )
    expect(
      homeFrames.length,
      'Home never showed the two seeded entries after the reload',
    ).toBeGreaterThan(0)
    const firstHome = homeFrames[0]!
    expect(firstHome.abbaas!.amount).toBe(String(HELD_CENTS))
    expect(
      firstHome.abbaas!.text,
      'the balance was still counting up on the first frame with reduced motion',
    ).toContain(HELD_TEXT)

    for (const frame of homeFrames) {
      for (const box of [frame.you, frame.abbaas]) {
        if (!box) continue
        expect(
          translationY(box.transform),
          `a box was displaced with reduced motion: ${box.transform}`,
        ).toBeCloseTo(0, 1)
        expect(box.opacity, 'a box was transparent with reduced motion').toBe(1)
      }
      for (const entry of frame.entries) {
        expect(
          translationX(entry.transform),
          `an entry was displaced with reduced motion: ${entry.transform}`,
        ).toBeCloseTo(0, 1)
        expect(entry.opacity, 'an entry was transparent with reduced motion').toBe(1)
      }
      for (const action of frame.actions) {
        expect(
          translationY(action.transform),
          `a bottom button was displaced with reduced motion: ${action.transform}`,
        ).toBeCloseTo(0, 1)
        expect(action.opacity, 'a bottom button was transparent with reduced motion').toBe(1)
      }
      if (frame.spine) {
        const scale = scaleY(frame.spine.transform)
        expect(
          scale,
          `the centre line's transform was unreadable: ${frame.spine.transform}`,
        ).not.toBeNull()
        expect(scale!, 'the centre line was drawing down with reduced motion').toBeCloseTo(1, 2)
      }
    }

    // ===== Opening Send shows every row at once, with no ripple. =====
    const tapFrames = await (async () => {
      const recording = startRecording(page)
      await page.locator('[data-action="send"]').click()
      return recording
    })()

    expect(
      tapFrames.flatMap((frame) => frame.motions),
      'data-motion was set with reduced motion on opening the form',
    ).toEqual([])
    expect(
      tapFrames.filter((frame) => frame.ripples.length > 0).map((frame) => frame.t),
      'a data-ripple element appeared on the tapped button with reduced motion',
    ).toEqual([])

    const withRows = tapFrames.filter((frame) => frame.rows.length >= MIN_ROWS)
    expect(
      withRows.length,
      `the form never held at least ${MIN_ROWS} data-row elements`,
    ).toBeGreaterThan(0)
    expect(
      withRows[0]!.rows.filter((row) => row.opacity < 1).length,
      'a row was still fading in on the first frame the form was shown with reduced motion',
    ).toBe(0)

    await expect(page.locator('[data-form="send"]')).toBeVisible()
    await expect(page.locator('[data-motion]')).toHaveCount(0)
    await expect(page.locator('[data-ripple]')).toHaveCount(0)
  } finally {
    await phone.close()
  }
})
