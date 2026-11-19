//! Escrow accounting module for the Soroban bridge vault.
//!
//! This module maintains a per-token escrow ledger inside Soroban persistent
//! storage and exposes helpers that enforce the accounting invariants described
//! below. The contract layer calls these helpers; the helpers are tested
//! independently in the `test_invariants` sub-module below.
//!
//! # Accounting invariants
//!
//! The following properties MUST hold after every state-changing call:
//!
//! I-1  TRACKED BALANCE ≥ 0
//!      The tracked escrow balance for any token is always non-negative.
//!
//! I-2  TRACKED BALANCE ≤ ACTUAL ON-CHAIN BALANCE
//!      The number stored in the escrow ledger never exceeds the token balance
//!      held by the vault contract. Divergence indicates an underpayment or
//!      accounting bug.
//!
//! I-3  DEPOSIT INCREASES TRACKED BALANCE BY EXACTLY `amount`
//!      After a successful `record_deposit`, `tracked_balance` increases by
//!      exactly the deposited amount.
//!
//! I-4  RELEASE DECREASES TRACKED BALANCE BY EXACTLY `amount`
//!      After a successful `record_release`, `tracked_balance` decreases by
//!      exactly the released amount.
//!
//! I-5  RELEASE OF MORE THAN TRACKED BALANCE IS ALWAYS REJECTED
//!      `record_release(amount)` panics when `amount > tracked_balance`,
//!      preventing underflow that would create phantom claimable balances.
//!
//! I-6  ZERO-AMOUNT DEPOSIT IS A NO-OP
//!      `record_deposit(0)` does not change `tracked_balance`.
//!
//! I-7  ZERO-AMOUNT RELEASE IS A NO-OP
//!      `record_release(0)` does not change `tracked_balance`.
//!
//! I-8  NEGATIVE AMOUNTS ARE ALWAYS REJECTED
//!      Negative deposits or releases are invalid accounting deltas and must
//!      never increase or decrease the ledger implicitly.
//!
//! # Failure behaviour
//!
//! Invalid deltas and accounting invariant violations panic immediately with a
//! descriptive message so the transaction is rolled back before any token
//! transfer can complete. Operators observing repeated panics on these paths
//! should investigate for bridging exploits or on-chain reorg artefacts.
//!
//! # Idempotency
//!
//! `record_deposit` and `record_release` are not idempotent by design —
//! each call changes state. Callers MUST ensure a deposit or release is
//! recorded exactly once per cross-chain message. Message deduplication is
//! the responsibility of the calling contract layer (keyed by `payload_id`).

use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

// ---------------------------------------------------------------------------
// Storage key type
// ---------------------------------------------------------------------------

/// Storage key discriminant for a tracked escrow balance entry.
#[contracttype]
#[derive(Clone)]
pub enum EscrowKey {
    /// Tracks the escrow balance for `token`.
    TokenBalance(Address),
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/// Return the currently tracked escrow balance for `token`.
/// Returns 0 when no entry exists yet.
pub fn tracked_balance(env: &Env, token: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&EscrowKey::TokenBalance(token.clone()))
        .unwrap_or(0i128)
}

/// Record that `amount` tokens have been deposited into the vault escrow.
///
/// # Panics
/// - If `amount` is negative.
/// - If `tracked_balance + amount` would overflow `i128` (never in practice
///   because Stellar token amounts fit in i64, but the guard is cheap).
pub fn record_deposit(env: &Env, token: &Address, amount: i128) {
    assert!(amount >= 0, "escrow accounting: negative deposit amount");
    if amount == 0 {
        return; // I-6: zero-amount deposit is a no-op
    }

    let current = tracked_balance(env, token);
    let new_balance = current.checked_add(amount)
        .expect("escrow accounting: deposit overflow");

    // I-1: result must be non-negative
    assert!(new_balance >= 0, "escrow accounting: balance below zero after deposit");

    env.storage()
        .persistent()
        .set(&EscrowKey::TokenBalance(token.clone()), &new_balance);
}

/// Record that `amount` tokens have been released from the vault escrow.
///
/// # Panics
/// - If `amount` is negative.
/// - If `amount > tracked_balance` (I-5): underflow protection.
/// - If `tracked_balance - amount < 0` (I-1): balance-below-zero protection.
pub fn record_release(env: &Env, token: &Address, amount: i128) {
    assert!(amount >= 0, "escrow accounting: negative release amount");
    if amount == 0 {
        return; // I-7: zero-amount release is a no-op
    }

    let current = tracked_balance(env, token);
    assert!(
        amount <= current,
        "escrow accounting: release amount {} exceeds tracked balance {}",
        amount,
        current
    );

    let new_balance = current - amount;

    // I-1 post-condition
    assert!(new_balance >= 0, "escrow accounting: balance below zero after release");

    env.storage()
        .persistent()
        .set(&EscrowKey::TokenBalance(token.clone()), &new_balance);
}

/// Assert the accounting invariant I-2: tracked ≤ actual.
///
/// Operators should call this after every bridge transaction to detect
/// divergence caused by bridging exploits or on-chain reorgs. Returns
/// `true` when the invariant holds.
pub fn assert_tracked_lte_actual(tracked: i128, actual: i128) -> bool {
    tracked <= actual
}

// ---------------------------------------------------------------------------
// Invariant tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test_invariants {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl,
        testutils::Address as _,
        Address, Env,
    };

    // Thin harness contract that exposes the accounting helpers to the test
    // environment.
    #[contract]
    struct EscrowHarness;

    #[contractimpl]
    impl EscrowHarness {
        pub fn deposit(env: Env, token: Address, amount: i128) {
            record_deposit(&env, &token, amount);
        }

        pub fn release(env: Env, token: Address, amount: i128) {
            record_release(&env, &token, amount);
        }

        pub fn balance(env: Env, token: Address) -> i128 {
            tracked_balance(&env, &token)
        }

        pub fn check_invariant(env: Env, token: Address, actual: i128) -> bool {
            assert_tracked_lte_actual(tracked_balance(&env, &token), actual)
        }
    }

    fn setup() -> (Env, EscrowHarnessClient<'static>, Address) {
        let env = Env::default();
        let contract_id = env.register(EscrowHarness, ());
        let client = EscrowHarnessClient::new(&env, &contract_id);
        let token = Address::generate(&env);
        (env, client, token)
    }

    // -----------------------------------------------------------------------
    // I-1: tracked balance ≥ 0
    // -----------------------------------------------------------------------

    #[test]
    fn i1_initial_balance_is_zero() {
        let (_env, client, token) = setup();
        assert_eq!(client.balance(&token), 0);
    }

    #[test]
    fn i1_balance_non_negative_after_deposit() {
        let (_env, client, token) = setup();
        client.deposit(&token, &1_000_000);
        assert!(client.balance(&token) >= 0);
    }

    // -----------------------------------------------------------------------
    // I-2: tracked ≤ actual
    // -----------------------------------------------------------------------

    #[test]
    fn i2_tracked_lte_actual_when_equal() {
        let (_env, client, token) = setup();
        client.deposit(&token, &500_000);
        // Simulate on-chain balance == tracked balance
        assert!(client.check_invariant(&token, &500_000));
    }

    #[test]
    fn i2_tracked_lte_actual_when_actual_is_higher() {
        let (_env, client, token) = setup();
        client.deposit(&token, &300_000);
        // On-chain balance may be higher due to direct transfers
        assert!(client.check_invariant(&token, &400_000));
    }

    #[test]
    fn i2_invariant_fails_when_tracked_exceeds_actual() {
        let (_env, client, token) = setup();
        client.deposit(&token, &1_000_000);
        // Actual is lower than tracked — invariant should fail
        assert!(!client.check_invariant(&token, &500_000));
    }

    // -----------------------------------------------------------------------
    // I-3: deposit increases tracked balance by exactly `amount`
    // -----------------------------------------------------------------------

    #[test]
    fn i3_deposit_increases_balance_exactly() {
        let (_env, client, token) = setup();
        let before = client.balance(&token);
        let amount: i128 = 7_000_000;
        client.deposit(&token, &amount);
        assert_eq!(client.balance(&token), before + amount);
    }

    #[test]
    fn i3_multiple_deposits_accumulate_correctly() {
        let (_env, client, token) = setup();
        client.deposit(&token, &1_000_000);
        client.deposit(&token, &2_000_000);
        client.deposit(&token, &3_000_000);
        assert_eq!(client.balance(&token), 6_000_000);
    }

    // -----------------------------------------------------------------------
    // I-4: release decreases tracked balance by exactly `amount`
    // -----------------------------------------------------------------------

    #[test]
    fn i4_release_decreases_balance_exactly() {
        let (_env, client, token) = setup();
        client.deposit(&token, &10_000_000);
        let before = client.balance(&token);
        let release_amount: i128 = 3_000_000;
        client.release(&token, &release_amount);
        assert_eq!(client.balance(&token), before - release_amount);
    }

    #[test]
    fn i4_release_full_amount_leaves_zero_balance() {
        let (_env, client, token) = setup();
        let amount: i128 = 5_000_000;
        client.deposit(&token, &amount);
        client.release(&token, &amount);
        assert_eq!(client.balance(&token), 0);
    }

    // -----------------------------------------------------------------------
    // I-5: release of more than tracked balance is always rejected
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "release amount")]
    fn i5_release_exceeding_balance_panics() {
        let (_env, client, token) = setup();
        client.deposit(&token, &1_000_000);
        client.release(&token, &2_000_000); // must panic
    }

    #[test]
    #[should_panic(expected = "release amount")]
    fn i5_release_from_zero_balance_panics() {
        let (_env, client, token) = setup();
        client.release(&token, &1); // balance is 0, must panic
    }

    // -----------------------------------------------------------------------
    // I-6: zero-amount deposit is a no-op
    // -----------------------------------------------------------------------

    #[test]
    fn i6_zero_deposit_does_not_change_balance() {
        let (_env, client, token) = setup();
        client.deposit(&token, &1_000_000);
        let before = client.balance(&token);
        client.deposit(&token, &0);
        assert_eq!(client.balance(&token), before);
    }

    // -----------------------------------------------------------------------
    // I-7: zero-amount release is a no-op
    // -----------------------------------------------------------------------

    #[test]
    fn i7_zero_release_does_not_change_balance() {
        let (_env, client, token) = setup();
        client.deposit(&token, &1_000_000);
        let before = client.balance(&token);
        client.release(&token, &0);
        assert_eq!(client.balance(&token), before);
    }

    // -----------------------------------------------------------------------
    // Cross-cutting: interleaved deposit/release sequence preserves I-1 & I-3/I-4
    // -----------------------------------------------------------------------

    #[test]
    fn cross_cutting_interleaved_sequence_preserves_invariants() {
        let (_env, client, token) = setup();

        // Sequence: deposit, deposit, release partial, deposit, release all
        client.deposit(&token, &10_000_000);
        assert_eq!(client.balance(&token), 10_000_000);

        client.deposit(&token, &5_000_000);
        assert_eq!(client.balance(&token), 15_000_000);

        client.release(&token, &4_000_000);
        assert_eq!(client.balance(&token), 11_000_000);

        client.deposit(&token, &3_000_000);
        assert_eq!(client.balance(&token), 14_000_000);

        client.release(&token, &14_000_000);
        assert_eq!(client.balance(&token), 0);

        // I-1: balance is non-negative throughout (0 at end)
        assert!(client.balance(&token) >= 0);
    }

    #[test]
    fn partial_fill_and_refund_sequences_preserve_accounting_invariants() {
        let (_env, client, token) = setup();
        let mut total_deposited = 0i128;
        let mut total_released = 0i128;

        fn assert_accounting(
            client: &EscrowHarnessClient<'_>,
            token: &Address,
            total_deposited: i128,
            total_released: i128,
        ) {
            let expected = total_deposited - total_released;
            assert_eq!(client.balance(token), expected);
            assert!(client.check_invariant(token, &expected));
        }

        // A partially filled transfer is followed by a refund, then another
        // fill against the remaining escrow.
        client.deposit(&token, &1_000);
        total_deposited += 1_000;
        assert_accounting(&client, &token, total_deposited, total_released);
        client.release(&token, &400);
        total_released += 400;
        assert_accounting(&client, &token, total_deposited, total_released);
        client.deposit(&token, &100);
        total_deposited += 100;
        assert_accounting(&client, &token, total_deposited, total_released);
        client.release(&token, &250);
        total_released += 250;
        assert_accounting(&client, &token, total_deposited, total_released);

        // Exercise repeated interleaved fills/refunds with a fixed seed so the
        // sequence is reproducible without relying on untrusted RPC data.
        let mut seed = 0x1414_u64;
        for _ in 0..128 {
            seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
            if seed & 1 == 0 || total_deposited == total_released {
                let amount = ((seed >> 32) % 100 + 1) as i128;
                client.deposit(&token, &amount);
                total_deposited += amount;
            } else {
                let available = total_deposited - total_released;
                let amount = ((seed >> 32) % available as u64 + 1) as i128;
                client.release(&token, &amount);
                total_released += amount;
            }
            assert_accounting(&client, &token, total_deposited, total_released);
        }
    }

    #[test]
    #[should_panic(expected = "negative deposit amount")]
    fn negative_deposit_is_rejected() {
        let (_env, client, token) = setup();
        client.deposit(&token, &-1);
    }

    #[test]
    #[should_panic(expected = "negative release amount")]
    fn negative_release_is_rejected() {
        let (_env, client, token) = setup();
        client.deposit(&token, &10);
        client.release(&token, &-1);
    }

    // -----------------------------------------------------------------------
    // Multi-token independence
    // -----------------------------------------------------------------------

    #[test]
    fn multi_token_balances_are_independent() {
        let env = Env::default();
        let contract_id = env.register(EscrowHarness, ());
        let client = EscrowHarnessClient::new(&env, &contract_id);

        let token_a = Address::generate(&env);
        let token_b = Address::generate(&env);

        client.deposit(&token_a, &1_000_000);
        client.deposit(&token_b, &2_000_000);

        // Releasing token_a does not affect token_b
        client.release(&token_a, &500_000);
        assert_eq!(client.balance(&token_a), 500_000);
        assert_eq!(client.balance(&token_b), 2_000_000);
    }
}
