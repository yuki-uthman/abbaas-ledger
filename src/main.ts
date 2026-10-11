// Composition root: the one place the Supabase adapters and the ports meet. The
// UI below it sees ports and plain values only.
//
// The order here is the observable promise of this value: the session this phone
// already holds is resolved BEFORE anything is painted, so a later visit, such as
// a launch from the home-screen icon, opens Home without the sign-in screen ever
// flashing.
import './ui/theme.css'
import { createSupabaseClient } from './adapters/supabase/client.js'
import { createSupabaseIdentity } from './adapters/supabase/identity.js'
import { createSupabaseLedgerStore } from './adapters/supabase/ledger-store.js'
import { balanceOf, type Balance } from './domain/balance.js'
import type { Credentials, Identity } from './ports/identity.js'
import type { LedgerStore, NewEntry } from './ports/ledger-store.js'
import { renderHome } from './ui/home.js'
import type { Point } from './ui/motion.js'
import { renderReceiveForm } from './ui/receive-form.js'
import { renderSendForm } from './ui/send-form.js'
import { emptySignInState, renderSignIn, type SignInState } from './ui/sign-in.js'

/** The one hash the send form answers to, so Android's back button closes it. */
const SEND_HASH = '#send'
/** The receive form's own hash, so the back button closes it the same way. */
const RECEIVE_HASH = '#receive'

const mount = (root: HTMLElement, screen: HTMLElement): void => {
  root.replaceChildren(screen)
}

/** The centre of a control, in viewport pixels: where its form grows from. */
const centreOf = (element: HTMLElement): Point => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

const start = async (root: HTMLElement, identity: Identity, store: LedgerStore): Promise<void> => {
  /**
   * What the save that has just happened left behind: the id of the stored
   * entry, which is all Undo needs, and the balance the ledger stood at before
   * it, which is where the boxes count from. Both live here and nowhere else: a
   * reload starts this as null, so a reload never shows a Saved message and
   * never animates, and leaving Home for either form clears it.
   */
  let justSaved: { readonly id: string; readonly balanceBefore: Balance } | null = null

  /**
   * Where the tap that is opening a form landed. It is taken by the screen that
   * grows from it and cleared, so a form reached by the back or forward button,
   * or by a visit straight to the hash, is shown whole rather than growing from
   * a point nobody touched.
   */
  let openOrigin: Point | null = null

  const takeOrigin = (): Point | null => {
    const origin = openOrigin
    openOrigin = null
    return origin
  }

  const showHome = async (): Promise<void> => {
    const saved = justSaved
    // The read is awaited before painting, so Home is never shown as empty while
    // its entries are still on the way. The balance it paints is the balance
    // after the save, which is the one the Saved message speaks.
    const screen = renderHome(
      await store.readEntries(),
      saved === null
        ? undefined
        : {
            entryId: saved.id,
            // The balance the boxes count from; the one they land on is the one
            // the re-read ledger above already says.
            balanceBefore: saved.balanceBefore,
            onUndo: async () => {
              const outcome = await store.removeEntry(saved.id)
              // A Retry changes nothing here: the entry is still stored, so Home
              // is left exactly as it is and the message says so.
              if (outcome.outcome === 'removed') {
                justSaved = null
                // Re-read, so the boxes, the list and the totals all come from
                // the ledger without that entry rather than from a local edit.
                await showHome()
              }
              return outcome
            },
          },
    )
    // Tapping Send only changes the hash; the router paints the form, so the
    // back button and the button itself travel the same single path. What the
    // tap adds is where it landed, which is where the form grows from.
    const sendButton = screen.querySelector<HTMLElement>('[data-action="send"]')
    if (sendButton !== null) {
      sendButton.addEventListener('click', () => {
        openOrigin = centreOf(sendButton)
        location.hash = SEND_HASH
      })
    }
    // Receive travels the same single path: the button only changes the hash and
    // the router paints the form.
    const receiveButton = screen.querySelector<HTMLElement>('[data-action="receive"]')
    if (receiveButton !== null) {
      receiveButton.addEventListener('click', () => {
        openOrigin = centreOf(receiveButton)
        location.hash = RECEIVE_HASH
      })
    }
    mount(root, screen)
  }

  /** Leaves a form the way the back button would, so history stays honest. */
  const leaveForm = (hash: string): void => {
    if (location.hash === hash) history.back()
    else void showHome()
  }

  const leaveSend = (): void => leaveForm(SEND_HASH)
  const leaveReceive = (): void => leaveForm(RECEIVE_HASH)

  const showSend = async (): Promise<void> => {
    // Leaving Home ends the Saved message of any earlier save.
    justSaved = null
    const origin = takeOrigin()
    // The form needs the saved people and the balance the new entry adds to.
    const [peopleOutcome, ledger] = await Promise.all([store.listPeople(), store.readEntries()])
    // The balance the form opened on is also the balance a save moves away
    // from, so it is what Home's boxes count up or down from afterwards.
    const balance = balanceOf(ledger.outcome === 'read' ? ledger.entries : [])
    mount(
      root,
      renderSendForm(
        {
          people: peopleOutcome.outcome === 'read' ? peopleOutcome.people : [],
          balance,
          origin,
        },
        {
          onClose: leaveSend,
          onAddPerson: (name: string) => store.addPerson(name),
          onSave: async (entry: NewEntry) => {
            const outcome = await store.addEntry(entry)
            // Only a stored entry leaves the form; a Retry keeps every value.
            // The stored row's id is what the Saved message's Undo takes back.
            if (outcome.outcome === 'added') {
              justSaved = { id: outcome.id, balanceBefore: balance }
              leaveSend()
            }
            return outcome
          },
        },
      ),
    )
  }

  const showReceive = async (): Promise<void> => {
    // Leaving Home ends the Saved message of any earlier save.
    justSaved = null
    const origin = takeOrigin()
    // A repayment names nobody, so the form needs the balance alone: what Abbaas
    // holds is what 'All of it' offers and what the note is measured against.
    const ledger = await store.readEntries()
    // The same balance a save moves away from, which Home's boxes count from.
    const balance = balanceOf(ledger.outcome === 'read' ? ledger.entries : [])
    mount(
      root,
      renderReceiveForm(
        { balance, origin },
        {
          onClose: leaveReceive,
          onSave: async (entry: NewEntry) => {
            const outcome = await store.addEntry(entry)
            // Only a stored payment leaves the form; a Retry keeps every value.
            // Leaving re-reads the ledger, so Home shows the new balance, and
            // the stored row's id is what the Saved message's Undo takes back.
            if (outcome.outcome === 'added') {
              justSaved = { id: outcome.id, balanceBefore: balance }
              leaveReceive()
            }
            return outcome
          },
        },
      ),
    )
  }

  const route = async (): Promise<void> => {
    if (location.hash === SEND_HASH) await showSend()
    else if (location.hash === RECEIVE_HASH) await showReceive()
    else await showHome()
  }

  /** Starts routing from wherever this visit landed, Home or the send form. */
  let routing = false
  const startRouting = async (): Promise<void> => {
    if (!routing) {
      routing = true
      window.addEventListener('hashchange', () => {
        void route()
      })
    }
    await route()
  }

  const showSignIn = (state: SignInState): void => {
    mount(
      root,
      renderSignIn(state, {
        onSignIn: (credentials: Credentials) => {
          void attempt(credentials)
        },
      }),
    )
  }

  const attempt = async (credentials: Credentials): Promise<void> => {
    const outcome = await identity.signIn(credentials)
    if (outcome.outcome === 'signed-in') {
      await startRouting()
      return
    }
    // A Refusal and a Retry both keep the sign-in screen and say which it was;
    // the password is dropped either way, because renderSignIn never carries it.
    showSignIn({ email: credentials.email, message: outcome.message, busy: false })
  }

  const session = await identity.currentAccount()
  if (session.outcome === 'signed-in') {
    await startRouting()
    return
  }
  // A rejected refresh is a Refusal that names itself, never an empty Home.
  showSignIn(
    session.outcome === 'refusal'
      ? { ...emptySignInState(), message: session.message }
      : emptySignInState(),
  )
}

/**
 * Registers the service worker, which is what lets Chrome offer to add the app to
 * the Android home screen and what lets the icon open it offline.
 *
 * It is deliberately a side errand: the promise is never awaited and a failure is
 * swallowed, because the ledger is an ordinary web page first. A browser without
 * service workers, or an origin that refuses one, must still sign in and work.
 *
 * The URLs are resolved against the document, so the same build registers at the
 * origin root in development and under the GitHub Pages sub-path in production.
 */
const registerServiceWorker = (): void => {
  if (!('serviceWorker' in navigator)) return
  const worker = new URL('sw.js', document.baseURI).href
  const scope = new URL('./', document.baseURI).href
  void navigator.serviceWorker.register(worker, { scope }).catch(() => {
    // Nothing to say and nothing to do: the page itself is unaffected.
  })
}

registerServiceWorker()

const root = document.querySelector<HTMLElement>('#app')
if (root) {
  const client = createSupabaseClient()
  void start(root, createSupabaseIdentity(client), createSupabaseLedgerStore(client))
}

