#![no_std]

//! Atomic swap vault for cross-chain tokens on Soroban.
//!
//! Coordinates cross-contract invocation transfers between internal bridge vaults
//! and external Stellar Asset Contracts (SACs), executing double-sided token
//! exchanges within a single transaction invocation boundary.

pub mod swap;

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

use swap::{AtomicSwapParams, SwapResult};

/// Custom error codes
const ERR_INSUFFICIENT_BALANCE: u32 = 1;
const ERR_INSUFFICIENT_ALLOWANCE: u32 = 2;
const ERR_SWAP_FAILED: u32 = 3;
const ERR_UNAUTHORIZED: u32 = 4;

#[derive(Clone)]
#[contracttype]
pub struct VaultState {
    pub token_a_balance: i128,
    pub token_b_balance: i128,
}

#[contract]
pub struct AtomicSwapVault;

#[contractimpl]
impl AtomicSwapVault {
    /// Execute an atomic swap between two token pairs.
    ///
    /// Both transfer legs execute within a single invocation boundary. If either
    /// leg fails, the entire transaction is reverted ensuring clean state rollback.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `operator` - The address authorized to execute swaps (must have ADMIN role or be operator)
    /// * `token_a` - Address of the first token contract
    /// * `token_b` - Address of the second token contract
    /// * `amount_a` - Amount of token A to swap
    /// * `amount_b` - Amount of token B expected in return
    /// * `sender_a` - Address sending token A
    /// * `sender_b` - Address sending token B
    pub fn execute_swap(
        env: Env,
        operator: Address,
        token_a: Address,
        token_b: Address,
        amount_a: i128,
        amount_b: i128,
        sender_a: Address,
        sender_b: Address,
    ) -> SwapResult {
        operator.require_auth();

        // Validate amounts
        if amount_a <= 0 || amount_b <= 0 {
            soroban_sdk::panic_with_error!(&env, ERR_INSUFFICIENT_BALANCE);
        }

        // Execute both legs atomically using Soroban's transactional semantics
        // If any step fails, the entire transaction reverts
        let result = swap::execute_atomic_swap(
            &env,
            &token_a,
            &token_b,
            amount_a,
            amount_b,
            &sender_a,
            &sender_b,
        );

        result
    }

    /// Check the vault balance for a specific token pair.
    pub fn get_balance(env: Env, token: Address) -> i128 {
        let key = Symbol::new(&env, "balance");
        env.storage()
            .persistent()
            .get(&(key, token))
            .unwrap_or(0)
    }

    /// Deposit tokens into the vault (for pre-funding swaps).
    pub fn deposit(env: Env, depositor: Address, token: Address, amount: i128) {
        depositor.require_auth();

        if amount <= 0 {
            soroban_sdk::panic_with_error!(&env, ERR_INSUFFICIENT_BALANCE);
        }

        let key = Symbol::new(&env, "balance");
        let current: i128 = env.storage()
            .persistent()
            .get(&(key.clone(), token.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&(key, token), &(current + amount));
    }
}
