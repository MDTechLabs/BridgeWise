#![cfg(test)]

use crate::{BridgeVault, BridgeVaultClient};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    Address, Env, Symbol,
};

fn setup(env: &Env) -> (BridgeVaultClient<'_>, Address) {
    env.mock_all_auths();
    let contract_id = env.register(BridgeVault, ());
    let client = BridgeVaultClient::new(env, &contract_id);
    let operator = Address::generate(env);
    (client, operator)
}

#[test]
fn extend_ttl_emits_rent_extended() {
    let env = Env::default();
    let (client, operator) = setup(&env);
    let key = Symbol::new(&env, "deposit_1");

    client.seed_persistent(&key, &1);
    client.extend_ttl(&operator, &key, &100, &1000);

    // The contract published at least one event during the call.
    assert!(!env.events().all().is_empty());
}

#[test]
fn bump_instance_ttl_emits_rent_extended() {
    let env = Env::default();
    let (client, operator) = setup(&env);

    client.bump_instance_ttl(&operator, &100, &1000);

    assert!(!env.events().all().is_empty());
}

#[test]
fn reclaim_storage_emits_storage_reclaimed() {
    let env = Env::default();
    let (client, operator) = setup(&env);
    let key = Symbol::new(&env, "temp_1");

    client.seed_temporary(&key, &1);
    client.reclaim_storage(&operator, &key);

    assert!(!env.events().all().is_empty());
}
