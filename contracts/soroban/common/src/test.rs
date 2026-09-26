#![cfg(test)]

use soroban_sdk::{contract, contractimpl, symbol_short, Env};

use crate::ttl_helper::{extend_instance_ttl_if_needed, extend_persistent_ttl_if_needed};

#[contract]
pub struct TtlTestContract;

#[contractimpl]
impl TtlTestContract {
    pub fn seed(env: Env, key: soroban_sdk::Symbol, value: u32) {
        env.storage().persistent().set(&key, &value);
    }

    pub fn bump_instance(env: Env, threshold: u32, extend_by: u32) {
        extend_instance_ttl_if_needed(&env, threshold, extend_by);
    }

    pub fn bump_persistent(env: Env, key: soroban_sdk::Symbol, threshold: u32, extend_by: u32) {
        extend_persistent_ttl_if_needed(&env, &key, threshold, extend_by);
    }
}

#[test]
fn instance_ttl_extends_when_below_threshold() {
    let env = Env::default();
    let contract_id = env.register(TtlTestContract, ());
    let client = TtlTestContractClient::new(&env, &contract_id);

    let initial_ttl = env.storage().instance().get_ttl();

    // Advance ledger so remaining TTL is low and then request an extension.
    env.ledger().set(env.ledger().sequence() + initial_ttl - 5);
    client.bump_instance(&5, &1_000);

    let new_ttl = env.storage().instance().get_ttl();
    assert!(new_ttl > initial_ttl - 5);
}

#[test]
fn persistent_ttl_extends_when_below_threshold() {
    let env = Env::default();
    let contract_id = env.register(TtlTestContract, ());
    let client = TtlTestContractClient::new(&env, &contract_id);

    let key = symbol_short!("counter");
    client.seed(&key, &1u32);

    let initial_ttl = env.storage().persistent().get_ttl(&key);
    env.ledger().set(env.ledger().sequence() + initial_ttl - 5);

    client.bump_persistent(&key, &5, &1_000);

    let new_ttl = env.storage().persistent().get_ttl(&key);
    assert!(new_ttl > initial_ttl - 5);
}
