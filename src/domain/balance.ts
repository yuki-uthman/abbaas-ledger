// The balance as a pure projection of the account's entries. No DOM, no
// Supabase: this module depends on nothing but the entry shape it reads.
//
// Rule: balanceCents = sum(usdCents of kind 'send') - sum(usdCents of kind
// 'receive'). Positive means Abbaas holds the owner's money, negative means the
// owner holds Abbaas's money, zero is All square. The amount the owner reads is
// never signed, so the projection reports the holder separately from the
// unsigned amount.

/** The part of an entry the balance depends on; a wider entry satisfies it. */
export type BalanceEntry = {
  readonly kind: 'send' | 'receive'
  readonly usdCents: number
}

/** Who holds money; 'none' exactly when the ledger is all square. */
export type Holder = 'you' | 'abbaas' | 'none'

export type Balance = {
  /** Signed: positive when Abbaas holds, negative when the owner holds. */
  readonly balanceCents: number
  readonly holder: Holder
  /** Never signed: what the holder's box shows. */
  readonly amountCents: number
  /** Totals behind the line under the boxes. */
  readonly sentCents: number
  readonly paidBackCents: number
}

const holderOf = (balanceCents: number): Holder => {
  if (balanceCents > 0) return 'abbaas'
  if (balanceCents < 0) return 'you'
  return 'none'
}

/** The balance of these entries, in any order: the rule is a sum. */
export const balanceOf = (entries: readonly BalanceEntry[]): Balance => {
  let sentCents = 0
  let paidBackCents = 0
  for (const entry of entries) {
    if (entry.kind === 'send') sentCents += entry.usdCents
    else paidBackCents += entry.usdCents
  }
  const balanceCents = sentCents - paidBackCents
  return {
    balanceCents,
    holder: holderOf(balanceCents),
    amountCents: Math.abs(balanceCents),
    sentCents,
    paidBackCents,
  }
}

/** The balance of a ledger with no entries: all square, nothing held. */
export const emptyBalance = (): Balance => balanceOf([])

/** What one box claims: only the holder's box is filled. */
export type BoxState = {
  readonly state: 'filled' | 'empty'
  readonly amountCents: number
}

/**
 * The box for one side of the card. A box is filled only when that side holds
 * the money, and an empty box claims nothing, so its amount is 0 and not the
 * balance it does not hold.
 */
export const boxFor = (balance: Balance, who: 'you' | 'abbaas'): BoxState =>
  balance.holder === who
    ? { state: 'filled', amountCents: balance.amountCents }
    : { state: 'empty', amountCents: 0 }
