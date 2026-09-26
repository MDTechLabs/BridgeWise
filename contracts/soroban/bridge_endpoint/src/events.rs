use soroban_sdk::{BytesN, Env, Symbol};
use crate::types::{BridgeEvent, BridgeEventData};

pub fn emit_bridge_event(
    env: &Env,
    event_type: BridgeEvent,
    source_chain: Symbol,
    target_chain: Symbol,
    payload_id: BytesN<32>,
    amount: i128,
) {
    let topics = (Symbol::new(env, "bridge"), event_type, source_chain, target_chain);
    let data = BridgeEventData { payload_id, amount };
    env.events().publish(topics, data);
}
