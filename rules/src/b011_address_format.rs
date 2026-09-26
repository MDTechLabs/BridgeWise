//! Rule B011: Target Chain Address Format Validation
//!
//! Static rule that flags cross-chain outbound transfer functions which
//! restrict their recipient parameter to a 20-byte EVM `address` (or
//! `address payable`) type when the function is plausibly routing to a
//! non-EVM destination chain. Such functions should instead accept a
//! `bytes` (dynamic) or `bytes32` recipient, since non-EVM chains (Solana,
//! Bitcoin, Cosmos, ...) commonly use address encodings that don't fit in
//! 20 bytes, or aren't fixed-length at all.
//!
//! This codebase's own `contracts/router/BatchBridgeRouter.sol` and
//! `contracts/router/NativeBridgeRouter.sol` already follow the desired
//! convention: they accept `bytes32 recipient` rather than `address
//! recipient` for exactly this reason.
//!
//! ## Heuristic
//!
//! There is no syntactic marker in Solidity source that says "this
//! function is a cross-chain outbound transfer" the way, say, a `payable`
//! keyword marks value-accepting functions. So this rule uses a two-part
//! name-based heuristic to decide whether a function is in scope at all:
//!
//! 1. **Function name** contains one of: `bridge`, `transfer`, `send`,
//!    `deposit`, `dispatch` (case-insensitive substring match).
//! 2. The function has **both**:
//!    - a parameter whose name contains `recipient`, `destination`, or
//!      `target` (case-insensitive) — the "recipient-like" parameter, and
//!    - a *separate* parameter whose name contains `chain` (case-insensitive)
//!      and whose declared type is an unsigned integer narrower than 256
//!      bits (`uint8`..`uint128`) — a "chain-ID-like" parameter. Narrow
//!      unsigned integers are the idiomatic Solidity encoding for a chain
//!      ID selector (see `uint32 destinationChainId` in
//!      `BatchBridgeRouter.sol`); requiring this second parameter is what
//!      lets the rule tell a genuine cross-chain router apart from a
//!      purely-domestic function that merely happens to have a
//!      `recipient` parameter (e.g. a plain ERC-20 `transfer`/`withdraw`
//!      wrapper).
//!
//! Only functions matching *both* (1) and (2) are considered in scope. For
//! every recipient-like parameter of an in-scope function, the rule flags
//! it if its declared type is `address` or `address payable`, and passes it
//! if the type is `bytes` (dynamic) or `bytes32`. Any other declared type
//! (e.g. `string`) is left alone — this rule is specifically about the
//! address-vs-fixed-20-byte-type distinction, not general address encoding
//! validation.
//!
//! ### Documented tradeoffs
//!
//! False negatives:
//! - A cross-chain function named something the heuristic doesn't
//!   recognize (e.g. `relayOut`, `moveAssets`) will be silently skipped.
//! - A cross-chain function whose chain-ID parameter is named without
//!   "chain" (e.g. `dstEid`, `targetDomain`) won't be recognized as
//!   cross-chain, even though it is.
//! - A cross-chain function whose chain selector is encoded as `uint256`
//!   rather than a narrower uint won't match the "chain-ID-like" type
//!   check as currently written.
//!
//! False positives:
//! - A purely-domestic function that happens to be named e.g.
//!   `depositToChainVault` with an unrelated `uint16 chainCount` parameter
//!   and an `address recipient` parameter could be incorrectly flagged,
//!   even though no address is actually crossing chains.
//! - Interface/abstract declarations (function bodies of `None`) are still
//!   checked; this is intentional since interfaces define the ABI contract
//!   that implementers must honor, but it means a stray interface stub
//!   with these names would also be flagged.
//!
//! This is an approximate, syntactic, first-version heuristic. It has no
//! access to cross-file/interface call-graph information or semantic
//! knowledge of "is this parameter's value ever routed off-chain," so it
//! is expected to need refinement (e.g. configurable name lists, opt-out
//! annotations) as it's used on real codebases.

use solang_parser::pt::{
    ContractPart, Expression, FunctionDefinition, Loc, Parameter, SourceUnit, SourceUnitPart, Type,
};

/// Name fragments (case-insensitive) that mark a function as a plausible
/// cross-chain outbound transfer/dispatch entrypoint.
const TRANSFER_NAME_HINTS: &[&str] = &["bridge", "transfer", "send", "deposit", "dispatch"];

/// Name fragments (case-insensitive) that mark a parameter as recipient-like.
const RECIPIENT_NAME_HINTS: &[&str] = &["recipient", "destination", "target"];

/// Name fragment (case-insensitive) that marks a parameter as a chain-ID-like
/// selector, when paired with a narrow unsigned integer type.
const CHAIN_NAME_HINT: &str = "chain";

/// A single rule violation produced by [`check_source`] / [`check_file`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    /// Name of the offending function.
    pub function_name: String,
    /// Name of the offending recipient-like parameter.
    pub parameter_name: String,
    /// 1-based source line number of the function definition, if it could
    /// be computed from the AST's byte-offset location.
    pub line: Option<usize>,
    /// Human-readable description of the violation.
    pub message: String,
}

/// Parses `source` as Solidity and runs rule B011 against it.
///
/// Returns `Err` with human-readable parse diagnostics if the source could
/// not be parsed at all. A successfully parsed source that has zero
/// violations returns `Ok(vec![])`.
pub fn check_source(source: &str) -> Result<Vec<Violation>, String> {
    let (source_unit, _comments) =
        solang_parser::parse(source, 0).map_err(|diags| format!("{diags:?}"))?;

    Ok(check_source_unit(&source_unit, source))
}

/// Reads `path` from disk and runs rule B011 against its contents.
pub fn check_file(path: &std::path::Path) -> Result<Vec<Violation>, String> {
    let source = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    check_source(&source)
}

/// Walks every contract's functions (plus any free/top-level functions) in
/// `source_unit`, applying the B011 heuristic and type check.
fn check_source_unit(source_unit: &SourceUnit, source: &str) -> Vec<Violation> {
    let mut violations = Vec::new();

    for part in &source_unit.0 {
        match part {
            SourceUnitPart::ContractDefinition(contract) => {
                for cpart in &contract.parts {
                    if let ContractPart::FunctionDefinition(func) = cpart {
                        check_function(func, source, &mut violations);
                    }
                }
            }
            SourceUnitPart::FunctionDefinition(func) => {
                check_function(func, source, &mut violations);
            }
            _ => {}
        }
    }

    violations
}

/// Applies the cross-chain-transfer heuristic and, if the function is in
/// scope, checks each recipient-like parameter's type.
fn check_function(func: &FunctionDefinition, source: &str, out: &mut Vec<Violation>) {
    let Some(name_ident) = &func.name else {
        return;
    };
    let function_name = name_ident.name.as_str();

    if !name_contains_any(function_name, TRANSFER_NAME_HINTS) {
        return;
    }

    let params: Vec<&Parameter> = func
        .params
        .iter()
        .filter_map(|(_, p)| p.as_ref())
        .collect();

    let has_chain_param = params.iter().any(|p| is_chain_id_param(p));
    if !has_chain_param {
        return;
    }

    for param in &params {
        let Some(param_name_ident) = &param.name else {
            continue;
        };
        let param_name = param_name_ident.name.as_str();

        if !name_contains_any(param_name, RECIPIENT_NAME_HINTS) {
            continue;
        }

        if let Some(restricted_type) = restricted_address_type(&param.ty) {
            let line = line_number(func.loc, source);
            out.push(Violation {
                function_name: function_name.to_string(),
                parameter_name: param_name.to_string(),
                line,
                message: format!(
                    "function `{function_name}` accepts a recipient parameter `{param_name}` of \
                     restricted type `{restricted_type}` (exactly 20 bytes), but this function \
                     appears to route to a non-EVM-aware destination (has a chain-ID-like \
                     parameter). Use `bytes` or `bytes32` instead so non-EVM recipient addresses \
                     (e.g. Solana, Bitcoin, Cosmos) are not truncated."
                ),
            });
        }
    }
}

/// Returns true if `param` looks like a chain-ID selector: its name
/// contains "chain" and its declared type is a narrow (< 256-bit) unsigned
/// integer.
fn is_chain_id_param(param: &Parameter) -> bool {
    let Some(name_ident) = &param.name else {
        return false;
    };
    if !name_ident.name.to_lowercase().contains(CHAIN_NAME_HINT) {
        return false;
    }

    matches!(
        type_of(&param.ty),
        Some(Type::Uint(bits)) if *bits < 256
    )
}

/// If `ty` is a restricted 20-byte address type (`address` / `address
/// payable`), returns a display label for it; otherwise `None` (i.e. the
/// type is fine, e.g. `bytes` / `bytes32` / anything else).
fn restricted_address_type(ty: &Expression) -> Option<&'static str> {
    match type_of(ty) {
        Some(Type::Address) => Some("address"),
        Some(Type::AddressPayable) => Some("address payable"),
        _ => None,
    }
}

/// Extracts the `pt::Type` out of a parameter's `Expression` slot, if the
/// expression is a plain elementary type reference (as it is for all
/// built-in Solidity types like `address`, `bytes32`, `uint32`, etc.).
fn type_of(ty: &Expression) -> Option<&Type> {
    match ty {
        Expression::Type(_, t) => Some(t),
        _ => None,
    }
}

/// Case-insensitive "does `haystack` contain any of `needles`" check.
fn name_contains_any(haystack: &str, needles: &[&str]) -> bool {
    let lower = haystack.to_lowercase();
    needles.iter().any(|n| lower.contains(n))
}

/// Converts a byte offset captured in `loc` into a 1-based source line
/// number by counting newlines in `source` up to that offset.
/// `solang_parser::pt::Loc` only carries byte offsets, not line/column
/// info, so this is computed manually.
fn line_number(loc: Loc, source: &str) -> Option<usize> {
    match loc {
        Loc::File(_, start, _) => {
            let prefix = source.get(..start)?;
            Some(prefix.matches('\n').count() + 1)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// Locates `test/fixtures/b011_samples.sol` relative to this crate's
    /// root (`rules/`), i.e. `<repo>/test/fixtures/b011_samples.sol`.
    fn fixture_path() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../test/fixtures/b011_samples.sol")
    }

    fn run_fixture() -> Vec<Violation> {
        let path = fixture_path();
        check_file(&path).unwrap_or_else(|e| {
            panic!("failed to check fixture at {}: {e}", path.display());
        })
    }

    #[test]
    fn fixture_file_exists_and_parses() {
        let path = fixture_path();
        assert!(
            path.exists(),
            "expected fixture file to exist at {}",
            path.display()
        );
        let source = std::fs::read_to_string(&path).expect("read fixture");
        check_source(&source).expect("fixture should parse as valid Solidity");
    }

    #[test]
    fn flags_address_recipient_on_cross_chain_transfer() {
        let violations = run_fixture();
        let hit = violations
            .iter()
            .find(|v| v.function_name == "bridgeTransfer");
        assert!(
            hit.is_some(),
            "expected `bridgeTransfer` (address recipient + chain-id param) to be flagged; got {violations:?}"
        );
        let hit = hit.unwrap();
        assert_eq!(hit.parameter_name, "recipient");
        assert!(hit.line.is_some(), "expected a resolved line number");
    }

    #[test]
    fn passes_bytes32_recipient_on_cross_chain_transfer() {
        let violations = run_fixture();
        assert!(
            violations
                .iter()
                .all(|v| v.function_name != "bridgeTransferBytes32"),
            "did not expect `bridgeTransferBytes32` (bytes32 recipient) to be flagged; got {violations:?}"
        );
    }

    #[test]
    fn passes_bytes_recipient_on_cross_chain_transfer() {
        let violations = run_fixture();
        assert!(
            violations
                .iter()
                .all(|v| v.function_name != "bridgeTransferBytes"),
            "did not expect `bridgeTransferBytes` (bytes calldata recipient) to be flagged; got {violations:?}"
        );
    }

    #[test]
    fn does_not_flag_non_cross_chain_function_with_recipient_param() {
        let violations = run_fixture();
        assert!(
            violations.iter().all(|v| v.function_name != "withdraw"),
            "did not expect `withdraw` (no chain-id param, non-cross-chain name) to be flagged \
             even though it has an `address recipient` param; got {violations:?}"
        );
    }

    #[test]
    fn total_violation_count_matches_expected() {
        let violations = run_fixture();
        assert_eq!(
            violations.len(),
            1,
            "expected exactly 1 violation (bridgeTransfer only); got {violations:?}"
        );
    }
}
