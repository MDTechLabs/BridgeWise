use soroban_sdk::{contracttype, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultBalanceQueryResult {
    pub token: Address,
    pub tracked_balance: i128,
    pub actual_balance: i128,
}

pub fn get_vault_balance(_env: &Env, token: Address, tracked_balance: i128, actual_balance: i128) -> VaultBalanceQueryResult {
    VaultBalanceQueryResult {
        token,
        tracked_balance,
        actual_balance,
    }
}
