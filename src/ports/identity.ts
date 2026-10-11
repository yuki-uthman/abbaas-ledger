// The Identity port, in domain terms only: who the owner is according to the
// session this phone already holds, and signing in once with email and password.
// This file knows nothing about Supabase.

export type SignedInAccount = {
  readonly id: string
  readonly email: string
}

export type Credentials = {
  readonly email: string
  readonly password: string
}

/** The messages the owner reads; named here so the UI and the adapter agree. */
export const WRONG_CREDENTIALS_MESSAGE = 'Email or password is wrong.'
export const UNREACHABLE_SERVER_MESSAGE = 'Cannot reach the server. Try again.'
export const SESSION_EXPIRED_MESSAGE = 'Please sign in again.'

/**
 * Resolving the session this phone holds. A rejected refresh is a Refusal that
 * sends the owner back to the sign-in screen, never an empty Home.
 */
export type CurrentAccountOutcome =
  | { readonly outcome: 'signed-in'; readonly account: SignedInAccount }
  | { readonly outcome: 'signed-out' }
  | { readonly outcome: 'refusal'; readonly message: string }

/** Signing in: wrong credentials is a Refusal, an unreachable endpoint a Retry. */
export type SignInOutcome =
  | { readonly outcome: 'signed-in'; readonly account: SignedInAccount }
  | { readonly outcome: 'refusal'; readonly message: string }
  | { readonly outcome: 'retry'; readonly message: string }

export type Identity = {
  /** The account of the persisted session, resolved before anything is painted. */
  readonly currentAccount: () => Promise<CurrentAccountOutcome>
  readonly signIn: (credentials: Credentials) => Promise<SignInOutcome>
}
