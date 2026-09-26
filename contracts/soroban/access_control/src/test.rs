extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use crate::{AccessControl, ADMIN_ROLE, RELAYER_ROLE, PAUSER_ROLE};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    env.mock_all_auths();
    (env, admin)
}

#[test]
fn test_initialize_grants_admin() {
    let (env, admin) = setup();
    env.register(AccessControl, ());
    let client = AccessControl::new(&env, &env.registered_contract_address_unchecked());

    let admin_role = Symbol::new(&env, ADMIN_ROLE);
    client.initialize(&admin);

    assert!(client.has_role(&admin_role, &admin));
}

#[test]
fn test_grant_and_check_role() {
    let (env, admin) = setup();
    env.register(AccessControl, ());
    let client = AccessControl::new(&env, &env.registered_contract_address_unchecked());

    let admin_role = Symbol::new(&env, ADMIN_ROLE);
    let relayer_role = Symbol::new(&env, RELAYER_ROLE);
    let relayer = Address::generate(&env);

    client.initialize(&admin);
    client.grant_role(&admin, &relayer_role, &relayer);

    assert!(client.has_role(&relayer_role, &relayer));
    assert!(!client.has_role(&admin_role, &relayer));
}

#[test]
fn test_revoke_role() {
    let (env, admin) = setup();
    env.register(AccessControl, ());
    let client = AccessControl::new(&env, &env.registered_contract_address_unchecked());

    let relayer_role = Symbol::new(&env, RELAYER_ROLE);
    let relayer = Address::generate(&env);

    client.initialize(&admin);
    client.grant_role(&admin, &relayer_role, &relayer);
    assert!(client.has_role(&relayer_role, &relayer));

    client.revoke_role(&admin, &relayer_role, &relayer);
    assert!(!client.has_role(&relayer_role, &relayer));
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_non_admin_cannot_grant() {
    let (env, _admin) = setup();
    env.register(AccessControl, ());
    let client = AccessControl::new(&env, &env.registered_contract_address_unchecked());

    let relayer_role = Symbol::new(&env, RELAYER_ROLE);
    let unauthorized = Address::generate(&env);
    let target = Address::generate(&env);

    client.initialize(&_admin);
    // unauthorized has no ADMIN role — should panic with ERR_UNAUTHORIZED
    client.grant_role(&unauthorized, &relayer_role, &target);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_non_admin_cannot_revoke() {
    let (env, admin) = setup();
    env.register(AccessControl, ());
    let client = AccessControl::new(&env, &env.registered_contract_address_unchecked());

    let pauser_role = Symbol::new(&env, PAUSER_ROLE);
    let pauser = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    client.initialize(&admin);
    client.grant_role(&admin, &pauser_role, &pauser);

    // unauthorized tries to revoke
    client.revoke_role(&unauthorized, &pauser_role, &pauser);
}

#[test]
fn test_role_check_for_pauser() {
    let (env, admin) = setup();
    env.register(AccessControl, ());
    let client = AccessControl::new(&env, &env.registered_contract_address_unchecked());

    let pauser_role = Symbol::new(&env, PAUSER_ROLE);
    let pauser = Address::generate(&env);

    client.initialize(&admin);
    assert!(!client.has_role(&pauser_role, &pauser));

    client.grant_role(&admin, &pauser_role, &pauser);
    assert!(client.has_role(&pauser_role, &pauser));
}
