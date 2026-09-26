#![no_std]

//! Role-Based Access Control (RBAC) module for Soroban contracts.
//!
//! Provides fine-grained role delegation supporting ADMIN, RELAYER, and PAUSER
//! roles. Admin accounts can grant and revoke roles. Unauthorized access attempts
//! trigger a panic with a custom error code.

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

/// Storage key prefix for role assignments.
const ROLE_PREFIX: &str = "role:";

/// Custom error codes
const ERR_UNAUTHORIZED: u32 = 1;

/// Role identifiers as Symbol constants
pub const ADMIN_ROLE: &str = "ADMIN";
pub const RELAYER_ROLE: &str = "RELAYER";
pub const PAUSER_ROLE: &str = "PAUSER";

#[derive(Clone)]
#[contracttype]
pub enum Role {
    Admin,
    Relayer,
    Pauser,
}

impl Role {
    pub fn to_symbol(&self, env: &Env) -> Symbol {
        match self {
            Role::Admin => Symbol::new(env, ADMIN_ROLE),
            Role::Relayer => Symbol::new(env, RELAYER_ROLE),
            Role::Pauser => Symbol::new(env, PAUSER_ROLE),
        }
    }

    pub fn from_symbol(env: &Env, sym: &Symbol) -> Option<Role> {
        let s = sym.to_buffer();
        let admin_sym = Symbol::new(env, ADMIN_ROLE);
        let relayer_sym = Symbol::new(env, RELAYER_ROLE);
        let pauser_sym = Symbol::new(env, PAUSER_ROLE);

        if *sym == admin_sym {
            Some(Role::Admin)
        } else if *sym == relayer_sym {
            Some(Role::Relayer)
        } else if *sym == pauser_sym {
            Some(Role::Pauser)
        } else {
            None
        }
    }
}

#[contract]
pub struct AccessControl;

#[contractimpl]
impl AccessControl {
    /// Check whether `account` has been granted `role`.
    pub fn has_role(env: Env, role: Symbol, account: Address) -> bool {
        let key = (Symbol::new(&env, ROLE_PREFIX), role, account);
        env.storage().persistent().get::<_, bool>(&key).unwrap_or(false)
    }

    /// Grant `role` to `account`. Restricted to ADMIN role holders.
    pub fn grant_role(env: Env, admin: Address, role: Symbol, account: Address) {
        Self::require_role(&env, &admin, &Role::Admin);
        let key = (Symbol::new(&env, ROLE_PREFIX), role.clone(), account.clone());
        env.storage().persistent().set(&key, &true);
    }

    /// Revoke `role` from `account`. Restricted to ADMIN role holders.
    pub fn revoke_role(env: Env, admin: Address, role: Symbol, account: Address) {
        Self::require_role(&env, &admin, &Role::Admin);
        let key = (Symbol::new(&env, ROLE_PREFIX), role.clone(), account.clone());
        env.storage().persistent().remove(&key);
    }

    /// Initialize the contract by granting ADMIN role to the deployer.
    pub fn initialize(env: Env, admin: Address) {
        let admin_role = Symbol::new(&env, ADMIN_ROLE);
        let key = (Symbol::new(&env, ROLE_PREFIX), admin_role, admin);
        env.storage().persistent().set(&key, &true);
    }

    /// Internal: require that `account` has the specified role, or panic.
    fn require_role(env: &Env, account: &Address, role: &Role) {
        let role_sym = role.to_symbol(env);
        let key = (Symbol::new(env, ROLE_PREFIX), role_sym, account.clone());
        let has = env.storage().persistent().get::<_, bool>(&key).unwrap_or(false);
        if !has {
            soroban_sdk::panic_with_error!(env, ERR_UNAUTHORIZED);
        }
    }
}

#[cfg(test)]
mod test;
