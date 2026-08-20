//! BridgeWise Solidity static-analysis rules.
//!
//! This is a standalone Rust crate (not part of any Cargo workspace,
//! matching the repo's existing convention of self-contained crates under
//! `contracts/soroban/*`). Each rule lives in its own module; the CLI in
//! `src/main.rs` runs a rule against a `.sol` file passed on the command
//! line.

pub mod b001_chain_id_check;
pub mod b009_signed_deadline;
