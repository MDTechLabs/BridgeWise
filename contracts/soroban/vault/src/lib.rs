#![no_std]
pub mod queries;

use soroban_sdk::{contract, contractimpl, Address, Env};
use queries::{get_vault_balance, VaultBalanceQueryResult};

#[contract]
pub struct SorobanVaultContract;

#[contractimpl]
impl SorobanVaultContract {
    pub fn get_balance(env: Env, token: Address, tracked: i128, actual: i128) -> VaultBalanceQueryResult {
        get_vault_balance(&env, token, tracked, actual)
    }
}
