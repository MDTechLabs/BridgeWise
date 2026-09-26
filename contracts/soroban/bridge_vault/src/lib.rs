#![no_std]

//! Bridge vault Soroban contract.
//!
//! Emits structured telemetry events (`RentExtended`, `StorageReclaimed`) when
//! storage entries have their TTL extended or are cleaned up, so indexers can
//! calculate total rent spent and track storage lifecycle costs across bridge
//! deposits.

mod events;

use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};

use events::{emit_rent_extended, emit_storage_reclaimed};

#[contract]
pub struct BridgeVault;

#[contractimpl]
impl BridgeVault {
    /// Extend the TTL of a persistent storage entry identified by `key`.
    /// Emits a `RentExtended` telemetry event.
    pub fn extend_ttl(env: Env, operator: Address, key: Symbol, threshold: u32, extend_to: u32) {
        operator.require_auth();
        env.storage()
            .persistent()
            .extend_ttl(&key, threshold, extend_to);
        emit_rent_extended(&env, key, extend_to, operator);
    }

    /// Bump the contract instance TTL. Emits a `RentExtended` event keyed to the
    /// instance storage.
    pub fn bump_instance_ttl(env: Env, operator: Address, threshold: u32, extend_to: u32) {
        operator.require_auth();
        env.storage().instance().extend_ttl(threshold, extend_to);
        emit_rent_extended(&env, Symbol::new(&env, "instance"), extend_to, operator);
    }

    /// Reclaim (remove) a temporary storage entry. Emits a `StorageReclaimed`
    /// event so indexers can track storage lifecycle costs.
    pub fn reclaim_storage(env: Env, operator: Address, key: Symbol) {
        operator.require_auth();
        env.storage().temporary().remove(&key);
        emit_storage_reclaimed(&env, key, operator);
    }

    /// Support helper: seed a persistent entry so its TTL can be extended.
    pub fn seed_persistent(env: Env, key: Symbol, value: u32) {
        env.storage().persistent().set(&key, &value);
    }

    /// Support helper: seed a temporary entry so it can be reclaimed.
    pub fn seed_temporary(env: Env, key: Symbol, value: u32) {
        env.storage().temporary().set(&key, &value);
    }
}

#[cfg(test)]
mod test;
