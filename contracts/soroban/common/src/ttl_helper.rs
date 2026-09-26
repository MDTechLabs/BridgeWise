//! TTL extension helpers for Soroban bridge contracts.
//!
//! These helpers automatically extend Instance and Persistent storage entry
//! Time-To-Live (TTL) ledgers on user interactions, preventing critical bridge
//! state from becoming archived.

use soroban_sdk::{Env, IntoVal};

/// Extend the contract instance TTL when the remaining ledgers drop below
/// `threshold`.
///
/// `extend_by` is the target TTL (in ledgers) that the entry should have after
/// extension, matching the semantics of `Instance::extend_ttl`. The Soroban host
/// only performs the extension when the current remaining TTL is below
/// `threshold`; otherwise the call is a no-op.
pub fn extend_instance_ttl_if_needed(env: &Env, threshold: u32, extend_by: u32) {
    env.storage().instance().extend_ttl(threshold, extend_by);
}

/// Extend a persistent storage entry's TTL when the remaining ledgers drop
/// below `threshold`.
///
/// The key type `K` must be convertible into a Soroban storage key. As with
/// [`extend_instance_ttl_if_needed`], `extend_by` is the target TTL in ledgers
/// and the extension only happens when the host determines the remaining TTL
/// is below `threshold`.
pub fn extend_persistent_ttl_if_needed<K>(env: &Env, key: &K, threshold: u32, extend_by: u32)
where
    K: IntoVal<Env, soroban_sdk::Val> + Clone,
{
    env.storage().persistent().extend_ttl(key, threshold, extend_by);
}
