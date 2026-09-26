use soroban_sdk::{contracttype, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BridgeEvent {
    Locked,
    Unlocked,
    Minted,
    Burned,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BridgeEventData {
    pub payload_id: BytesN<32>,
    pub amount: i128,
}
