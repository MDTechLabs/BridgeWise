use soroban_sdk::{contracttype, Address, Env, Symbol};

/// Result of an atomic swap execution.
#[derive(Clone)]
#[contracttype]
pub struct SwapResult {
    pub success: bool,
    pub amount_a: i128,
    pub amount_b: i128,
}

/// Parameters for an atomic swap.
#[derive(Clone)]
#[contracttype]
pub struct AtomicSwapParams {
    pub token_a: Address,
    pub token_b: Address,
    pub amount_a: i128,
    pub amount_b: i128,
    pub sender_a: Address,
    pub sender_b: Address,
}

/// Execute the atomic swap logic.
///
/// Transfers token_a from sender_a to sender_b and token_b from sender_b to
/// sender_a within a single transaction boundary. If any transfer fails, the
/// entire transaction reverts.
pub fn execute_atomic_swap(
    env: &Env,
    token_a: &Address,
    token_b: &Address,
    amount_a: i128,
    amount_b: i128,
    sender_a: &Address,
    sender_b: &Address,
) -> SwapResult {
    // Transfer leg 1: sender_a sends token_a to sender_b
    let client_a = soroban_sdk::token::Client::new(env, token_a);
    client_a.transfer(sender_a, sender_b, &amount_a);

    // Transfer leg 2: sender_b sends token_b to sender_a
    let client_b = soroban_sdk::token::Client::new(env, token_b);
    client_b.transfer(sender_b, sender_a, &amount_b);

    SwapResult {
        success: true,
        amount_a,
        amount_b,
    }
}
