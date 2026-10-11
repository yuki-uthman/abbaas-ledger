// Motion as a handful of helpers over the DOM: whether this device asked for
// less of it, the circle a form grows from the tapped button, the arrival of a
// saved entry from its own side, and the count of a box's amount to its new
// value. Nothing here knows what a balance or an entry means; the callers hand
// over the element and the two ends of the journey.
//
// The observable contract this value fixes:
//   - while a motion runs its element carries data-motion with one of
//     'reveal' (a form root), 'enter' (the new entry), 'count' (a box whose
//     amount is counting) or 'swap' (both boxes while the holder changes)
//   - the attribute is removed the moment that motion ends
//   - with prefers-reduced-motion: reduce nothing here runs at all, so
//     data-motion is never set, nothing is ever clipped, and the screen the
//     caller painted - which is already the end state - is simply shown
//
// Only transform, opacity and clip-path are touched, so no frame can force a
// layout, and the longest motion is 900 ms, well inside the 1.5 s the design
// allows from a motion's start.
//
// This module depends on the DOM and on nothing else: even the words a counting
// amount reads are not its business, so the caller hands in the formatter it
// already uses for that figure and the count cannot drift from it.

/** The reveal, the entry's arrival: the design's entrance band, at its top. */
export const REVEAL_MS = 520
export const ENTER_MS = 520
/** How long after Home appears the new entry starts arriving. */
export const ENTER_DELAY_MS = 380
/** The balance count, and the longer one for a holder that changes. */
export const COUNT_MS = 700
export const SWAP_MS = 900

/** The circle the form opens from, and how far past the form it grows. */
const START_RADIUS_PX = 30
/** clip-path's circle(150% ...), resolved to pixels so no frame reads calc(). */
const REVEAL_RADIUS_SCALE = 1.5
/** How far the new entry starts from where it settles. */
const ENTER_SHIFT_PX = 44
/** A little past the transition's end, so the attribute is never left behind. */
const ENTER_SLACK_MS = 40

/** A point in viewport pixels: where a tap landed. */
export type Point = {
  readonly x: number
  readonly y: number
}

/**
 * Whether this device has asked for reduced motion. Read at the moment a motion
 * would start rather than once at load, so the answer is always the current one.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** One axis of the design's curve, as a cubic Bézier with its ends at 0 and 1. */
const axis = (first: number, second: number, t: number): number => {
  const rest = 1 - t
  return 3 * rest * rest * t * first + 3 * rest * t * t * second + t * t * t
}

/**
 * The design's one curve, cubic-bezier(0.2, 0.8, 0.2, 1), as a function of
 * progress. The x axis is inverted by bisection, which is what a browser does
 * for the same declaration; it is monotonic and never leaves [0, 1], so a count
 * driven by it never shows a value outside the two ends.
 */
const ease = (progress: number): number => {
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  let low = 0
  let high = 1
  let t = progress
  for (let turn = 0; turn < 20; turn += 1) {
    if (axis(0.2, 0.2, t) < progress) low = t
    else high = t
    t = (low + high) / 2
  }
  return axis(0.8, 1, t)
}

/**
 * Runs one motion frame by frame: the element carries data-motion from the
 * first frame, paint draws each eased step, and the last frame settles the end
 * state and drops the attribute together, so no frame can ever show the final
 * value while still claiming to be moving.
 *
 * Progress is read from the clock and not counted in frames, so a tab that was
 * hidden while this ran lands on exactly the same end state on its next visible
 * frame.
 */
const step = (
  element: HTMLElement,
  name: string,
  durationMs: number,
  paint: (eased: number) => void,
  settle: () => void,
): void => {
  let startedAt: number | null = null
  const frame = (now: number): void => {
    if (startedAt === null) {
      startedAt = now
      element.dataset.motion = name
    }
    if (now - startedAt >= durationMs) {
      settle()
      delete element.dataset.motion
      return
    }
    paint(ease((now - startedAt) / durationMs))
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/**
 * Grows a form root as a circle from the point that was tapped: a 30 px circle
 * at that point out to 150 % of the form, over 520 ms, after which the form
 * carries no clip-path at all.
 *
 * The circle is placed in the form's own reference box, so the tapped point,
 * which arrives in viewport pixels, is offset by that box's origin. The radius
 * is stepped in pixels rather than transitioned from 30px to 150%, because a
 * browser interpolates those two units into a calc() that says nothing about
 * where the circle is.
 *
 * The form is held at opacity 0 for the single frame before the first circle is
 * in place, so opening never flashes the whole screen first.
 */
export const revealFrom = (form: HTMLElement, origin: Point): void => {
  if (prefersReducedMotion()) return
  form.style.opacity = '0'

  type Circle = { readonly x: number; readonly y: number; readonly endRadius: number }

  /**
   * Measured on the first frame, when the form is laid out, and kept for the
   * rest of the motion, so every frame reports the same centre: the one point
   * the tap landed on.
   */
  const measure = (): Circle => {
    const box = form.getBoundingClientRect()
    // What a percentage radius resolves against: the reference box's diagonal
    // over the square root of two.
    const reach = Math.sqrt(box.width * box.width + box.height * box.height) / Math.SQRT2
    return {
      x: origin.x - box.left,
      y: origin.y - box.top,
      endRadius: REVEAL_RADIUS_SCALE * reach,
    }
  }

  let measured: Circle | null = null
  step(
    form,
    'reveal',
    REVEAL_MS,
    (eased) => {
      const circle = measured ?? measure()
      measured = circle
      // The form was held back only until there was a circle to show it through.
      form.style.opacity = '1'
      const radius = START_RADIUS_PX + (circle.endRadius - START_RADIUS_PX) * eased
      form.style.clipPath = `circle(${radius.toFixed(2)}px at ${circle.x.toFixed(2)}px ${circle.y.toFixed(2)}px)`
    },
    () => {
      form.style.opacity = ''
      // Not an empty string: the form must be read as clipping nothing.
      form.style.clipPath = 'none'
    },
  )
}

/**
 * Brings a saved entry in from its own side: 44 px away and invisible, settling
 * to where it belongs over 520 ms, starting 380 ms after Home appears so the
 * balance card has the eye first.
 *
 * The motion is one whole from the moment the entry is first held back, not
 * only from the moment it begins to travel: data-motion is set before the
 * displaced, invisible start state is, and dropped only once the entry rests.
 * So the entry never sits shifted or transparent without saying that it is
 * mid-motion, and a reader that waits for no data-motion to remain and then
 * measures can only ever read the resting entry.
 *
 * The two ends are set here; the duration and the curve between them belong to
 * the transition in theme.css. That transition hangs on data-enter="travel",
 * which is set only for the journey itself, so the 380 ms hold applies its
 * start state at once instead of animating into it.
 */
export const enterEntry = (entry: HTMLElement, kind: 'send' | 'receive'): void => {
  if (prefersReducedMotion()) return
  const shift = kind === 'send' ? -ENTER_SHIFT_PX : ENTER_SHIFT_PX
  // Declared before it is displaced: the hold is part of the motion.
  entry.dataset.motion = 'enter'
  entry.dataset.enter = 'held'
  entry.style.opacity = '0'
  entry.style.transform = `translateX(${shift}px)`

  window.setTimeout(() => {
    entry.dataset.enter = 'travel'
    // Reading the layout flushes the style, so the frame that starts the
    // transition sees the shifted, invisible entry as where it comes from.
    void entry.offsetHeight
    entry.style.transform = 'none'
    entry.style.opacity = '1'
    window.setTimeout(() => {
      delete entry.dataset.motion
      delete entry.dataset.enter
      entry.style.transform = ''
      entry.style.opacity = ''
    }, ENTER_MS + ENTER_SLACK_MS)
  }, ENTER_DELAY_MS)
}

/**
 * Counts a balance box's amount from what it held before a save to what it
 * holds after it: 700 ms, or 900 ms when the money has crossed to the other
 * side and this box is one of a swapping pair.
 *
 * Only the text moves. The box was painted in its end state by Home, so
 * data-amount and data-state already hold the value the count is travelling
 * to, and the text the count lands on is the one Home wrote.
 */
export type Count = {
  /** What the box held before the save, and what it holds after it. */
  readonly fromCents: number
  readonly toCents: number
  /** 'swap' when this box is one of a pair the money has crossed between. */
  readonly name: 'count' | 'swap'
  /** How the caller writes a figure of cents, so the count reads the same way. */
  readonly format: (cents: number) => string
}

export const countBoxAmount = (box: HTMLElement, count: Count): void => {
  if (prefersReducedMotion()) return
  const amount = box.querySelector<HTMLElement>('[data-box-amount]')
  if (amount === null) return
  const endText = amount.textContent ?? ''
  const travel = count.toCents - count.fromCents
  step(
    box,
    count.name,
    count.name === 'swap' ? SWAP_MS : COUNT_MS,
    (eased) => {
      amount.textContent = count.format(Math.round(count.fromCents + travel * eased))
    },
    () => {
      amount.textContent = endText
    },
  )
}
