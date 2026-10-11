// Identity over Supabase Auth. The adapter's whole job is to turn transport
// results into the port's named outcomes: a Refusal the owner can act on, or a
// Retry for a server that cannot be reached.
import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js'
import {
  SESSION_EXPIRED_MESSAGE,
  UNREACHABLE_SERVER_MESSAGE,
  WRONG_CREDENTIALS_MESSAGE,
  type CurrentAccountOutcome,
  type Credentials,
  type Identity,
  type SignInOutcome,
  type SignedInAccount,
} from '../../ports/identity.js'

const accountOf = (user: User): SignedInAccount => ({
  id: user.id,
  email: user.email ?? '',
})

/**
 * A failure that is about reaching the server rather than about the credentials:
 * supabase-js names its fetch failures retryable, and 5xx is the server's own.
 */
const isUnreachable = (error: AuthError): boolean =>
  error.name === 'AuthRetryableFetchError' ||
  error.status === undefined ||
  error.status === 0 ||
  error.status >= 500

export const createSupabaseIdentity = (client: SupabaseClient): Identity => ({
  currentAccount: async (): Promise<CurrentAccountOutcome> => {
    const { data, error } = await client.auth.getSession()
    if (error) {
      // A persisted session whose refresh was rejected: ask for the password
      // again rather than showing an empty Home that looks like a lost ledger.
      return { outcome: 'refusal', message: SESSION_EXPIRED_MESSAGE }
    }
    const user = data.session?.user
    return user ? { outcome: 'signed-in', account: accountOf(user) } : { outcome: 'signed-out' }
  },

  signIn: async (credentials: Credentials): Promise<SignInOutcome> => {
    const { data, error } = await client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    })
    if (error) {
      return isUnreachable(error)
        ? { outcome: 'retry', message: UNREACHABLE_SERVER_MESSAGE }
        : { outcome: 'refusal', message: WRONG_CREDENTIALS_MESSAGE }
    }
    if (!data.user) {
      return { outcome: 'refusal', message: WRONG_CREDENTIALS_MESSAGE }
    }
    return { outcome: 'signed-in', account: accountOf(data.user) }
  },
})
