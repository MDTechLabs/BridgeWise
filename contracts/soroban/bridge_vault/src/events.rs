use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

/// Emitted when a storage entry's TTL is extended (rent paid to keep state live).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RentExtended {
    /// Symbol identifying the storage key whose TTL was extended.
    pub key: Symbol,
    /// The ledger the entry's TTL was extended to.
    pub added_ttl: u32,
    /// Operator that triggered the extension.
    pub operator: Address,
}

/// Emitted when an expired/temporary storage entry is cleaned up.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageReclaimed {
    /// Symbol identifying the reclaimed storage key.
    pub key: Symbol,
    /// Operator that triggered the reclaim.
    pub operator: Address,
}

/// Publish a `RentExtended` event under the `rent_ext` topic.
pub fn emit_rent_extended(env: &Env, key: Symbol, added_ttl: u32, operator: Address) {
    let event = RentExtended {
        key,
        added_ttl,
        operator,
    };
    env.events().publish((symbol_short!("rent_ext"),), event);
}

/// Publish a `StorageReclaimed` event under the `stor_rec` topic.
pub fn emit_storage_reclaimed(env: &Env, key: Symbol, operator: Address) {
    let event = StorageReclaimed { key, operator };
    env.events().publish((symbol_short!("stor_rec"),), event);
}
