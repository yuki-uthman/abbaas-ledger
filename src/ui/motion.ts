// Motion as a handful of helpers over the DOM: whether this device asked for
// less of it, the circle a form grows from the tapped button, the circle HOME
// grows from that form's save button, the arrival of a saved entry from its own
// side, and the count of a box's amount to its new value. Nothing here knows
// what a balance or an entry means; the callers hand over the element and the
// two ends of the journey.
//
// Refined board value 7 adds the two entrances the app opens with: Home's own,
// played once when the app opens, and the rows of a form that has just been
// tapped open, with the white ripple that marks the tap. Both are built from the
// same one idea as everything above - a part is put in its start state, declares
// itself mid-motion, travels on the one curve and is left with no inline style
// at all - so nothing here grew a second way of moving.
//
// The observable contract this value fixes:
//   - while a motion runs its element carries data-motion with one of
//     'reveal' (a form root), 'grow' (Home, mounted above the form it was saved
//     from), 'enter' (the new entry), 'count' (a box whose amount is counting),
//     'swap' (both boxes while the holder changes), 'home-enter' (Home's root
//     while the opening entrance runs) or 'row' (a form row rising in)
//   - the attribute is removed the moment that motion ends
//   - with prefers-reduced-motion: reduce nothing here runs at all, so
//     data-motion is never set, nothing is ever clipped, and the screen the
//     caller painted - which is already the end state - is simply shown
//
// Only transform, opacity, clip-path and the max-height of the one day group
// that opens are touched. The longest single motion is 900 ms, and the longest
// thing here of any kind is Home's opening entrance, whose last part rests well
// inside the 1.6 s the refined board caps it at.
//
// This module depends on the DOM and on nothing else: even the words a counting
// amount reads are not its business, so the caller hands in the painter it
// already uses for that figure and the count cannot drift from it.

/** The reveal, and Home growing from the save button: the entrance band's top. */
export const REVEAL_MS = 520
export const GROW_MS = 520
export const ENTER_MS = 520
/**
 * How long after the save Home's new entry starts arriving: not until the
 * growing circle has filled the screen, so only the entry is seen to move.
 */
export const ENTER_DELAY_MS = GROW_MS
/** The balance count, and the longer one for a holder that changes. */
export const COUNT_MS = 700
export const SWAP_MS = 900
/** The pressed state the save button wears once the save has gone through. */
export const PRESS_MS = 120
/* Refined board value 5 removed the Saved message, so nothing is raised after
   the rest of a save has landed and no such pause is declared here. */

/**
 * Home's opening entrance, in the refined board's own numbers: the boxes rise
 * one after the other, the centre line draws down from its top, the holder's
 * amount counts up from nothing, each card arrives from its own side of the
 * line, the totals and the Entries heading fade in and the bottom buttons rise.
 *
 * Every delay is measured from the moment Home is mounted, and the longest of
 * them plus its own journey is what the whole entrance takes.
 */
const BOX_SHIFT_PX = 12
const BOX_SCALE = 0.97
/** The Abbaas box follows the You box, so the pair reads left to right. */
const BOX_STEP_MS = 70
const BOX_RISE_MS = 460
const SPINE_DELAY_MS = 200
const SPINE_DRAW_MS = 640
/** When the holder's amount starts counting; how long it takes is COUNT_MS. */
const COUNT_DELAY_MS = 250
const CARD_DELAY_MS = 260
const CARD_STEP_MS = 70
const CARD_SHIFT_PX = 28
const CARD_RISE_MS = 420
/**
 * How many cards are staggered before the rest travel together: a long ledger
 * must still land inside the 1.6 s the board allows the entrance, and anything
 * past the first few cards is below the fold anyway.
 */
const CARD_STAGGER_CAP = 8
const FADE_DELAY_MS = 200
const FADE_MS = 320
const ACTION_DELAY_MS = 180
const ACTION_SHIFT_PX = 24
const ACTION_RISE_MS = 420

/** A form's rows rising in after the circle has started filling the screen. */
const ROW_DELAY_MS = 240
const ROW_STEP_MS = 45
const ROW_SHIFT_PX = 16
const ROW_RISE_MS = 280

/** The ripple that marks the tap a form was opened by. */
const RIPPLE_SIZE_PX = 120
const RIPPLE_MS = 360

/** The circle the form opens from, and how far past the form it grows. */
const START_RADIUS_PX = 30
/** clip-path's circle(150% ...), resolved to pixels so no frame reads calc(). */
const REVEAL_RADIUS_SCALE = 1.5
/** How far the new entry starts from where it settles, and how small. */
const ENTER_SHIFT_PX = 44
const ENTER_SCALE = 0.94
/** A little past the transition's end, so the attribute is never left behind. */
const ENTER_SLACK_MS = 40

/**
 * How long the whole of a save's motion on Home takes, from the moment Home is
 * mounted to the moment the last of it rests: the entry is the last to land,
 * because it waits for the grow to fill the screen before it travels. Nothing
 * follows it - value 5 removed the Saved message that used to rise after it -
 * so this is where a save comes to rest.
 */
export const SAVE_MOTION_MS = ENTER_DELAY_MS + ENTER_MS + ENTER_SLACK_MS

/** A point in viewport pixels: where a tap landed. */
export type Point = {
  readonly x: number
  readonly y: number
}

/** The centre of a control, in viewport pixels: what a circle grows from. */
export const centreOf = (element: HTMLElement): Point => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
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
 * Grows HOME as a circle from the save button of the form it was saved from:
 * Home is already mounted above that form, which stays under its dim layer
 * until the circle has covered the screen.
 *
 * The radius steps from 0 to past the screen's far corner - the furthest of the
 * four corners from the button, so the last thing the circle reaches is the one
 * that is furthest away - and at the end the clip is removed, data-motion is
 * dropped, and `settle` is what takes the form and its dim layer out of the DOM.
 *
 * With reduced motion nothing grows and nothing is ever clipped: `settle` runs
 * at once, which leaves Home alone on the screen in the end state the caller
 * painted it in.
 */
export const growFrom = (home: HTMLElement, origin: Point, settle: () => void): void => {
  if (prefersReducedMotion()) {
    settle()
    return
  }
  // Held back for the single frame before the first circle is in place, and
  // before Home is lifted over the form: the save never flashes a second screen
  // laid out under the first.
  home.style.opacity = '0'

  type Circle = { readonly x: number; readonly y: number; readonly endRadius: number }

  /**
   * Measured on the first frame, when Home is laid out over the form, and kept
   * for the rest of the motion, so every frame reports the same centre: the one
   * point the tap landed on.
   */
  const measure = (): Circle => {
    const box = home.getBoundingClientRect()
    const x = origin.x - box.left
    const y = origin.y - box.top
    const reach = Math.max(
      Math.hypot(x, y),
      Math.hypot(box.width - x, y),
      Math.hypot(x, box.height - y),
      Math.hypot(box.width - x, box.height - y),
    )
    // A pixel past the far corner, so no edge is left unpainted at the end.
    return { x, y, endRadius: reach + 1 }
  }

  let measured: Circle | null = null
  step(
    home,
    'grow',
    GROW_MS,
    (eased) => {
      const circle = measured ?? measure()
      measured = circle
      // Home was held back only until there was a circle to show it through.
      home.style.opacity = '1'
      const radius = circle.endRadius * eased
      home.style.clipPath = `circle(${radius.toFixed(2)}px at ${circle.x.toFixed(2)}px ${circle.y.toFixed(2)}px)`
    },
    () => {
      // Home clips nothing once it has filled the screen, and the form it grew
      // over has nothing left to be seen through.
      home.style.opacity = ''
      home.style.clipPath = ''
      settle()
    },
  )
}

/**
 * What a form does the moment its save has gone through: the white save button
 * wears a pressed state for 120 ms, and a dim layer fades in over the whole
 * form, so the Home growing above it is read as arriving over something that is
 * still there rather than as a screen that was swapped.
 *
 * Neither is carried by a contract attribute: they are the look of a form that
 * is being left, and the form itself leaves the DOM when the grow ends.
 */
export const pressAndDim = (form: HTMLElement, button: HTMLElement): void => {
  if (prefersReducedMotion()) return
  button.dataset.pressed = ''
  window.setTimeout(() => {
    delete button.dataset.pressed
  }, PRESS_MS)

  const dim = document.createElement('div')
  dim.className = 'form-dim'
  dim.setAttribute('aria-hidden', 'true')
  form.append(dim)
  // Read back, so the layer fades in from nothing instead of starting opaque.
  void dim.offsetHeight
  dim.dataset.dim = 'on'
}

/**
 * Opens the space a new day group takes, so the older days move down rather
 * than jump: the group is held at no height and grows to its own over the same
 * 520 ms the circle takes, which is before the new entry travels.
 *
 * The height is read on the first frame after Home is mounted, because a group
 * that is not yet in the document has no height to read. Nothing but max-height
 * moves, and the group is left with no inline height at all afterwards, so the
 * list goes back to being laid out by its own content.
 */
export const openDayGroup = (group: HTMLElement): void => {
  if (prefersReducedMotion()) return
  requestAnimationFrame(() => {
    const full = group.scrollHeight
    group.dataset.opening = ''
    group.style.maxHeight = '0px'
    // Read back, so the open below travels from no height rather than replacing it.
    void group.offsetHeight
    group.style.maxHeight = `${full}px`
    window.setTimeout(() => {
      delete group.dataset.opening
      group.style.maxHeight = ''
    }, GROW_MS + ENTER_SLACK_MS)
  })
}

/**
 * Brings a saved entry in from its own side: 44 px away, a little smaller and
 * invisible, settling to where it belongs over 520 ms, starting only once the
 * growing circle has filled the screen, so Home arrives whole and then the one
 * new entry is the only thing seen to move.
 *
 * Its own side is the side it is drawn on: a send comes from the left and a
 * payment from Abbaas from the right.
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
  entry.style.transform = `translateX(${shift}px) scale(${ENTER_SCALE})`

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
 * Only the figure moves. The box was painted in its end state by Home, so
 * data-amount and data-state already hold the value the count is travelling to.
 *
 * Every frame of the count is written by the caller's own painter, the one that
 * painted the box in the first place, so a counting figure keeps the structure
 * a resting one has - the whole dollars and the half-size cents span beside
 * them - on every frame, and the figure it lands on is the one Home wrote.
 */
export type Count = {
  /** What the box held before the save, and what it holds after it. */
  readonly fromCents: number
  readonly toCents: number
  /** 'swap' when this box is one of a pair the money has crossed between. */
  readonly name: 'count' | 'swap'
  /** How the caller writes a figure of cents into the box's amount element. */
  readonly paint: (amount: HTMLElement, cents: number) => void
}

export const countBoxAmount = (box: HTMLElement, count: Count): void => {
  if (prefersReducedMotion()) return
  const amount = box.querySelector<HTMLElement>('[data-box-amount]')
  if (amount === null) return
  const travel = count.toCents - count.fromCents
  step(
    box,
    count.name,
    count.name === 'swap' ? SWAP_MS : COUNT_MS,
    (eased) => {
      count.paint(amount, Math.round(count.fromCents + travel * eased))
    },
    () => {
      count.paint(amount, count.toCents)
    },
  )
}

// ---------------------------------------------------------------------------
// Value 7: the entrances. One part of a screen arriving is one `rise`: it is put
// in its start state at once, says which kind of part it is so the stylesheet
// knows how long it travels for, and is let go after its own delay. Nothing
// about which parts there are, or what any of them mean, is known here.
// ---------------------------------------------------------------------------

type Rise = {
  readonly element: HTMLElement
  /** Which kind of part this is: what the stylesheet times it by. */
  readonly kind: 'box' | 'spine' | 'card' | 'fade' | 'action' | 'row'
  readonly delayMs: number
  readonly riseMs: number
  /** The transform it travels from, or null for a part that only fades in. */
  readonly from: string | null
  /** Whether its opacity travels from 0, or is left exactly as painted. */
  readonly fades: boolean
  /**
   * The data-motion this part carries for a journey of its own. A part of one
   * larger entrance carries none: the screen's own root says that it is running.
   */
  readonly motion?: string
}

/**
 * Puts one part in its start state and schedules its journey, answering with the
 * moment it rests, measured from now.
 *
 * The start state is applied while the part is still held - data-enter-phase is
 * 'held', which no transition hangs on - so the part is simply put where it
 * comes from instead of animating into it; the layout is read back before the
 * phase becomes 'travel', so the frame that starts the transition sees that
 * start state as where the part is travelling from.
 */
const rise = (plan: Rise): number => {
  const element = plan.element
  if (plan.motion !== undefined) element.dataset.motion = plan.motion
  element.dataset.enterRise = plan.kind
  element.dataset.enterPhase = 'held'
  if (plan.from !== null) element.style.transform = plan.from
  if (plan.fades) element.style.opacity = '0'
  window.setTimeout(() => {
    element.dataset.enterPhase = 'travel'
    // Reading the layout flushes the style, so the transition starts from the
    // held state rather than from wherever the part would otherwise rest.
    void element.offsetHeight
    if (plan.from !== null) element.style.transform = 'none'
    if (plan.fades) element.style.opacity = '1'
  }, plan.delayMs)
  return plan.delayMs + plan.riseMs
}

/**
 * Leaves a part exactly as the caller painted it: no inline transform, no
 * inline opacity, no phase and no motion of its own. What is left is the end
 * state, which is the state the screen was built in all along.
 */
const settleRise = (element: HTMLElement): void => {
  delete element.dataset.motion
  delete element.dataset.enterRise
  delete element.dataset.enterPhase
  element.style.transform = ''
  element.style.opacity = ''
}

/**
 * The amount Home's entrance counts up: the holder's figure, from nothing to
 * what it holds. The figure is written by the caller's own painter, as every
 * other count here is, so a counting figure keeps the structure of a resting one
 * and lands exactly on the figure Home wrote.
 */
export type OpeningCount = {
  readonly amount: HTMLElement
  readonly toCents: number
  readonly paint: (amount: HTMLElement, cents: number) => void
}

/**
 * Counts from $0 after a delay, and answers with the moment it rests. The zero
 * is written at once rather than when the count begins, so no frame of the
 * entrance shows the final figure before the count has travelled to it.
 *
 * Progress is read from the clock, so a tab that was hidden while this ran lands
 * on exactly the same end state on its next visible frame.
 */
const countUpFromZero = (count: OpeningCount): number => {
  count.paint(count.amount, 0)
  const startsAt = performance.now() + COUNT_DELAY_MS
  const frame = (now: number): void => {
    const progress = (now - startsAt) / COUNT_MS
    if (progress >= 1) {
      count.paint(count.amount, count.toCents)
      return
    }
    if (progress > 0) count.paint(count.amount, Math.round(count.toCents * ease(progress)))
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return COUNT_DELAY_MS + COUNT_MS
}

/** What Home's entrance travels: the parts, named by the screen that built them. */
export type Opening = {
  /** The two boxes, in reading order: the second follows the first. */
  readonly boxes: readonly HTMLElement[]
  /** The centre line, which draws down from its own top. */
  readonly spine: HTMLElement | null
  /** Each entry's card with the side it belongs to, in the order they are read. */
  readonly cards: readonly {
    readonly element: HTMLElement
    readonly kind: 'send' | 'receive'
  }[]
  /** The parts that only fade in: the totals, the chip and the Entries heading. */
  readonly fades: readonly HTMLElement[]
  /** The bottom buttons, which rise together. */
  readonly actions: readonly HTMLElement[]
  /** The holder's amount, or null when nobody holds anything to count. */
  readonly count: OpeningCount | null
}

/**
 * Plays Home's entrance on opening the app: the whole of it is one motion, so
 * Home's root carries data-motion="home-enter" from before the first start state
 * is applied until the last part has rested, and every part is left with no
 * inline style of its own afterwards.
 *
 * Home is painted in its end state first and always, exactly as a save's motion
 * finds it, so a device that asked for reduced motion - where this does nothing
 * at all - reads the same screen, at once, from the first frame.
 */
export const enterHome = (screen: HTMLElement, opening: Opening): void => {
  if (prefersReducedMotion()) return
  // Declared before anything is displaced: the hold is part of the motion.
  screen.dataset.motion = 'home-enter'

  const moved: HTMLElement[] = []
  let restsAt = 0
  const plan = (rising: Rise): void => {
    moved.push(rising.element)
    restsAt = Math.max(restsAt, rise(rising))
  }

  opening.boxes.forEach((element, index) => {
    plan({
      element,
      kind: 'box',
      delayMs: index * BOX_STEP_MS,
      riseMs: BOX_RISE_MS,
      from: `translateY(${BOX_SHIFT_PX}px) scale(${BOX_SCALE})`,
      fades: true,
    })
  })

  if (opening.spine !== null) {
    // Only its height travels, from no height at its top: the line draws down.
    plan({
      element: opening.spine,
      kind: 'spine',
      delayMs: SPINE_DELAY_MS,
      riseMs: SPINE_DRAW_MS,
      from: 'scaleY(0)',
      fades: false,
    })
  }

  opening.cards.forEach(({ element, kind }, index) => {
    // Its own side is the side it is drawn on: a send from the left of the
    // centre line, a payment from Abbaas from the right.
    const shift = kind === 'send' ? -CARD_SHIFT_PX : CARD_SHIFT_PX
    plan({
      element,
      kind: 'card',
      delayMs: CARD_DELAY_MS + Math.min(index, CARD_STAGGER_CAP) * CARD_STEP_MS,
      riseMs: CARD_RISE_MS,
      from: `translateX(${shift}px)`,
      fades: true,
    })
  })

  for (const element of opening.fades) {
    plan({
      element,
      kind: 'fade',
      delayMs: FADE_DELAY_MS,
      riseMs: FADE_MS,
      from: null,
      fades: true,
    })
  }

  for (const element of opening.actions) {
    plan({
      element,
      kind: 'action',
      delayMs: ACTION_DELAY_MS,
      riseMs: ACTION_RISE_MS,
      from: `translateY(${ACTION_SHIFT_PX}px)`,
      fades: true,
    })
  }

  if (opening.count !== null) restsAt = Math.max(restsAt, countUpFromZero(opening.count))

  // A little past the last transition's end, so no part is left displaced and
  // the screen stops claiming to be moving only once nothing is.
  window.setTimeout(() => {
    for (const element of moved) settleRise(element)
    delete screen.dataset.motion
  }, restsAt + ENTER_SLACK_MS)
}

/**
 * Rises a form's rows in, one after another, once the circle the form opened as
 * has started filling the screen: each row comes from 16 px below where it
 * belongs, 45 ms after the row above it.
 *
 * Each row owns its own journey, so each carries data-motion while it travels:
 * the form root's reveal is over before the last row has landed, and a row must
 * never sit low and invisible without saying that it is still arriving.
 */
export const enterRows = (rows: readonly HTMLElement[]): void => {
  if (prefersReducedMotion()) return
  rows.forEach((row, index) => {
    const restsAt = rise({
      element: row,
      kind: 'row',
      delayMs: ROW_DELAY_MS + index * ROW_STEP_MS,
      riseMs: ROW_RISE_MS,
      from: `translateY(${ROW_SHIFT_PX}px)`,
      fades: true,
      motion: 'row',
    })
    window.setTimeout(() => settleRise(row), restsAt + ENTER_SLACK_MS)
  })
}

/**
 * The white ripple that marks the button a form was opened by: a 120 px circle
 * at that point, growing and fading over 360 ms.
 *
 * It is fixed to the viewport rather than put inside the button, because the
 * screen the button belongs to is replaced the moment the form opens; it says
 * nothing, takes no taps and is hidden from assistive technology, and it is out
 * of the document again as soon as it has faded.
 */
export const rippleAt = (origin: Point): void => {
  if (prefersReducedMotion()) return
  const ripple = document.createElement('div')
  ripple.className = 'tap-ripple'
  ripple.dataset.ripple = 'held'
  ripple.setAttribute('aria-hidden', 'true')
  ripple.style.left = `${origin.x - RIPPLE_SIZE_PX / 2}px`
  ripple.style.top = `${origin.y - RIPPLE_SIZE_PX / 2}px`
  document.body.append(ripple)
  // Read back, so the circle grows from its small self rather than starting big.
  void ripple.offsetHeight
  ripple.dataset.ripple = 'out'
  window.setTimeout(() => {
    ripple.remove()
  }, RIPPLE_MS + ENTER_SLACK_MS)
}
