//! Rule B001: Enforce Target and Source Chain ID in Bridge Hashes
//!
//! Cross-chain message hashes that omit explicit chain IDs can be
//! intercepted and replayed on fork chains or alternative EVM networks that
//! happen to share the same contract address layout. This rule parses a
//! Solidity source file with `solang-parser`, walks every function body
//! looking for `keccak256(...)` call expressions, and flags any call whose
//! hashed payload does not reference a chain ID anywhere in its argument
//! tree.
//!
//! ## Scope heuristic: which `keccak256` calls are inspected?
//!
//! We scan **every** `keccak256(...)` call found inside a function (or
//! modifier) body in the file, rather than narrowing to functions whose
//! name/context suggests "hash"/"sign"/"verify"/"message". A broad scan has
//! fewer false negatives (it won't miss a vulnerable hash construction just
//! because the containing function has an unconventional name) at the cost
//! of a few more false positives on unrelated hashing. Since B001 is meant
//! to catch a real security bug (cross-chain replay), the acceptance
//! criteria's own wording ("Flags cross-chain hash constructions lacking
//! source or destination chain IDs") does not require scoping to specific
//! function names, so the broad scan is the more defensible default here.
//! A fuller version of this rule would likely narrow scope with additional
//! context, e.g. only flagging `keccak256` calls inside functions/branches
//! that also reference signature-recovery primitives like `ecrecover`.
//!
//! We deliberately *do not* scan `keccak256(...)` calls that appear as
//! contract-level state variable initializers (e.g. an EIP-712
//! `_TYPE_HASH` constant such as
//! `keccak256("EIP712Domain(string name, ...)")`). Those are compile-time
//! hashes of a fixed type string, not per-message hash constructions, and
//! flagging them would be a false positive against real EIP-712
//! implementations (see the acceptance criterion "passes on EIP-712 ...
//! implementations").
//!
//! ## Chain ID reference heuristic
//!
//! Within a flagged `keccak256(...)` call's full argument expression tree
//! (recursively descending through `abi.encode`/`abi.encodePacked` and any
//! other nesting), a call is considered safe if any sub-expression is:
//!   * the literal `block.chainid` (a `MemberAccess` node on `block`), or
//!   * an identifier whose name plausibly represents a chain ID — contains
//!     (case-insensitively) `chainid`, `chain_id`, `sourcechain`,
//!     `destinationchain`, `targetchain`, or `srcchain`.
//!
//! This is a heuristic on identifier naming, not a data-flow analysis, so a
//! chain ID threaded through an oddly-named variable could still be missed
//! (false negative) and, in principle, a variable that merely contains one
//! of these substrings but isn't actually a chain ID could be misread as
//! safe (false positive). Given the "Easy" scope of this rule and the lack
//! of an existing naming convention to anchor to in this codebase, this is
//! a reasonable default.
//!
//! Once a `keccak256(...)` call is matched, this walker does **not**
//! descend into its own arguments looking for further *nested* `keccak256`
//! calls to treat as independent violation sites. EIP-712 domain
//! separators commonly nest calls like `keccak256(bytes("MyDapp"))` /
//! `keccak256(bytes("1"))` inside the outer domain-separator hash; those
//! inner hashes are static name/version hashes, not independent
//! cross-chain message hashes, so they should not be flagged on their own.

use solang_parser::parse;
use solang_parser::pt::{
    CatchClause, ContractPart, Expression, FunctionDefinition, Loc, SourceUnitPart, Statement,
};

/// A single flagged `keccak256(...)` call site.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    /// Name of the enclosing function (or `<unnamed>` for constructors /
    /// fallback / receive functions, which solang-parser represents with
    /// no identifier).
    pub function_name: String,
    /// 1-based source line number of the offending `keccak256(...)` call,
    /// computed from the AST's byte-offset `Loc`.
    pub line: usize,
    /// Human-readable description of the violation.
    pub message: String,
}

/// Parse `source` as Solidity and run the B001 chain-ID check over every
/// function/modifier body in it.
///
/// Returns `Err` with a human-readable message if the source fails to
/// parse as Solidity.
pub fn check_source(source: &str) -> Result<Vec<Violation>, String> {
    let (tree, _comments) =
        parse(source, 0).map_err(|diags| format!("failed to parse Solidity source: {diags:?}"))?;

    let mut violations = Vec::new();
    for part in &tree.0 {
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

    Ok(violations)
}

fn check_function(func: &FunctionDefinition, source: &str, violations: &mut Vec<Violation>) {
    let fn_name = func
        .name
        .as_ref()
        .map(|i| i.name.clone())
        .unwrap_or_else(|| "<unnamed>".to_string());

    let Some(body) = &func.body else {
        return;
    };

    let mut top_exprs = Vec::new();
    collect_exprs_from_stmt(body, &mut top_exprs);

    let mut calls: Vec<(Loc, &Vec<Expression>)> = Vec::new();
    for e in top_exprs {
        find_keccak_calls(e, &mut calls);
    }

    for (loc, args) in calls {
        let has_chain_id = args.iter().any(contains_chain_id_ref);
        if !has_chain_id {
            violations.push(Violation {
                function_name: fn_name.clone(),
                line: line_for_loc(source, loc),
                message: format!(
                    "keccak256(...) in function `{fn_name}` does not include a chain ID \
                     (block.chainid or an explicit chain-id variable/parameter) in its \
                     hashed payload - vulnerable to cross-chain replay"
                ),
            });
        }
    }
}

/// Gather every `Expression` that is directly attached to a statement tree
/// (condition expressions, return values, assignment initializers, etc.),
/// recursing into nested statements (blocks, if/else, loops, try/catch...).
/// Each gathered expression is later fully walked (see [`find_keccak_calls`]
/// and [`contains_chain_id_ref`]) so nested calls within it are still found.
///
/// Note: `Statement::Assembly` (inline Yul) bodies are not descended into -
/// hashing performed via raw Yul `keccak256` opcodes is out of scope for
/// this AST-level rule.
fn collect_exprs_from_stmt<'a>(stmt: &'a Statement, out: &mut Vec<&'a Expression>) {
    match stmt {
        Statement::Block { statements, .. } => {
            for s in statements {
                collect_exprs_from_stmt(s, out);
            }
        }
        Statement::Assembly { .. } => {}
        Statement::Args(_, named_args) => {
            for na in named_args {
                out.push(&na.expr);
            }
        }
        Statement::If(_, cond, then_stmt, else_stmt) => {
            out.push(cond);
            collect_exprs_from_stmt(then_stmt, out);
            if let Some(e) = else_stmt {
                collect_exprs_from_stmt(e, out);
            }
        }
        Statement::While(_, cond, body) => {
            out.push(cond);
            collect_exprs_from_stmt(body, out);
        }
        Statement::Expression(_, e) => out.push(e),
        Statement::VariableDefinition(_, _decl, init) => {
            if let Some(e) = init {
                out.push(e);
            }
        }
        Statement::For(_, init, cond, update, body) => {
            if let Some(s) = init {
                collect_exprs_from_stmt(s, out);
            }
            if let Some(e) = cond {
                out.push(e);
            }
            if let Some(e) = update {
                out.push(e);
            }
            if let Some(s) = body {
                collect_exprs_from_stmt(s, out);
            }
        }
        Statement::DoWhile(_, body, cond) => {
            collect_exprs_from_stmt(body, out);
            out.push(cond);
        }
        Statement::Continue(_) | Statement::Break(_) | Statement::Error(_) => {}
        Statement::Return(_, e) => {
            if let Some(e) = e {
                out.push(e);
            }
        }
        Statement::Revert(_, _path, args) => {
            for a in args {
                out.push(a);
            }
        }
        Statement::RevertNamedArgs(_, _path, named_args) => {
            for na in named_args {
                out.push(&na.expr);
            }
        }
        Statement::Emit(_, e) => out.push(e),
        Statement::Try(_, e, returns_clause, catches) => {
            out.push(e);
            if let Some((_, body)) = returns_clause {
                collect_exprs_from_stmt(body, out);
            }
            for c in catches {
                match c {
                    CatchClause::Simple(_, _, body) => collect_exprs_from_stmt(body, out),
                    CatchClause::Named(_, _, _, body) => collect_exprs_from_stmt(body, out),
                }
            }
        }
    }
}

/// Immediate child expressions of `expr` (one level of descent). Used to
/// build the full recursive expression walk in [`find_keccak_calls`] and
/// [`contains_chain_id_ref`].
fn expr_children(expr: &Expression) -> Vec<&Expression> {
    use Expression::*;
    match expr {
        PostIncrement(_, e)
        | PostDecrement(_, e)
        | New(_, e)
        | Parenthesis(_, e)
        | Not(_, e)
        | BitwiseNot(_, e)
        | Delete(_, e)
        | PreIncrement(_, e)
        | PreDecrement(_, e)
        | UnaryPlus(_, e)
        | Negate(_, e) => vec![e.as_ref()],
        ArraySubscript(_, a, b) => {
            let mut v = vec![a.as_ref()];
            if let Some(b) = b {
                v.push(b.as_ref());
            }
            v
        }
        ArraySlice(_, a, b, c) => {
            let mut v = vec![a.as_ref()];
            if let Some(b) = b {
                v.push(b.as_ref());
            }
            if let Some(c) = c {
                v.push(c.as_ref());
            }
            v
        }
        MemberAccess(_, e, _) => vec![e.as_ref()],
        FunctionCall(_, callee, args) => {
            let mut v = vec![callee.as_ref()];
            v.extend(args.iter());
            v
        }
        // The block statement (`{value: ..., gas: ...}`) attached to a
        // FunctionCallBlock is not descended into for expressions; it is
        // rare for a chain-ID-relevant expression to live there.
        FunctionCallBlock(_, callee, _block) => vec![callee.as_ref()],
        NamedFunctionCall(_, callee, named_args) => {
            let mut v = vec![callee.as_ref()];
            v.extend(named_args.iter().map(|na| &na.expr));
            v
        }
        Power(_, a, b)
        | Multiply(_, a, b)
        | Divide(_, a, b)
        | Modulo(_, a, b)
        | Add(_, a, b)
        | Subtract(_, a, b)
        | ShiftLeft(_, a, b)
        | ShiftRight(_, a, b)
        | BitwiseAnd(_, a, b)
        | BitwiseXor(_, a, b)
        | BitwiseOr(_, a, b)
        | Less(_, a, b)
        | More(_, a, b)
        | LessEqual(_, a, b)
        | MoreEqual(_, a, b)
        | Equal(_, a, b)
        | NotEqual(_, a, b)
        | And(_, a, b)
        | Or(_, a, b)
        | Assign(_, a, b)
        | AssignOr(_, a, b)
        | AssignAnd(_, a, b)
        | AssignXor(_, a, b)
        | AssignShiftLeft(_, a, b)
        | AssignShiftRight(_, a, b)
        | AssignAdd(_, a, b)
        | AssignSubtract(_, a, b)
        | AssignMultiply(_, a, b)
        | AssignDivide(_, a, b)
        | AssignModulo(_, a, b) => vec![a.as_ref(), b.as_ref()],
        ConditionalOperator(_, a, b, c) => vec![a.as_ref(), b.as_ref(), c.as_ref()],
        List(_, params) => params
            .iter()
            .filter_map(|(_, p)| p.as_ref().map(|p| &p.ty))
            .collect(),
        ArrayLiteral(_, exprs) => exprs.iter().collect(),
        BoolLiteral(..)
        | NumberLiteral(..)
        | RationalNumberLiteral(..)
        | HexNumberLiteral(..)
        | StringLiteral(..)
        | Type(..)
        | HexLiteral(..)
        | AddressLiteral(..)
        | Variable(..) => vec![],
    }
}

/// The identifier name of a call's callee, e.g. `keccak256` for
/// `keccak256(...)`, or `encodePacked` for `abi.encodePacked(...)`
/// (member-access calls only look at the member name, not the base).
fn callee_name(callee: &Expression) -> Option<&str> {
    match callee {
        Expression::Variable(ident) => Some(ident.name.as_str()),
        Expression::MemberAccess(_, _, ident) => Some(ident.name.as_str()),
        _ => None,
    }
}

/// Recursively find every `keccak256(...)` call reachable from `expr`.
/// Does not descend into the arguments of a call once it has been
/// identified as `keccak256(...)` itself (see module docs).
fn find_keccak_calls<'a>(expr: &'a Expression, out: &mut Vec<(Loc, &'a Vec<Expression>)>) {
    if let Expression::FunctionCall(loc, callee, args) = expr {
        if callee_name(callee) == Some("keccak256") {
            out.push((*loc, args));
            return;
        }
    }
    for child in expr_children(expr) {
        find_keccak_calls(child, out);
    }
}

/// Whether `expr`, or any expression reachable from it, is a reference to
/// a chain ID (`block.chainid`, or an identifier whose name plausibly
/// denotes a chain ID - see module docs for the exact heuristic).
fn contains_chain_id_ref(expr: &Expression) -> bool {
    match expr {
        Expression::MemberAccess(_, base, member) => {
            if member.name.eq_ignore_ascii_case("chainid") {
                if let Expression::Variable(base_ident) = base.as_ref() {
                    if base_ident.name.eq_ignore_ascii_case("block") {
                        return true;
                    }
                }
            }
            expr_children(expr).into_iter().any(contains_chain_id_ref)
        }
        Expression::Variable(ident) => {
            looks_like_chain_id_name(&ident.name)
                || expr_children(expr).into_iter().any(contains_chain_id_ref)
        }
        _ => expr_children(expr).into_iter().any(contains_chain_id_ref),
    }
}

fn looks_like_chain_id_name(name: &str) -> bool {
    const PATTERNS: [&str; 6] = [
        "chainid",
        "chain_id",
        "sourcechain",
        "destinationchain",
        "targetchain",
        "srcchain",
    ];
    let lower = name.to_lowercase();
    PATTERNS.iter().any(|p| lower.contains(p))
}

/// Convert a `solang_parser::pt::Loc::File` byte offset into a 1-based
/// source line number by counting newlines up to that offset. Other `Loc`
/// variants (builtin/codegen/etc.) have no real source position and map to
/// line `0`.
fn line_for_loc(source: &str, loc: Loc) -> usize {
    match loc {
        Loc::File(_, start, _) => {
            let end = start.min(source.len());
            source[..end].matches('\n').count() + 1
        }
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// Load the shared fixture file from `test/fixtures/b001_samples.sol`,
    /// resolved relative to this crate's own directory (`CARGO_MANIFEST_DIR`
    /// is set by Cargo at build time to the crate root, i.e. `rules/`) so
    /// the test works regardless of the working directory `cargo test` is
    /// invoked from.
    fn fixture_source() -> String {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("test")
            .join("fixtures")
            .join("b001_samples.sol");
        std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("failed to read fixture at {path:?}: {e}"))
    }

    #[test]
    fn fixture_parses_successfully() {
        let source = fixture_source();
        let result = check_source(&source);
        assert!(result.is_ok(), "expected fixture to parse: {result:?}");
    }

    #[test]
    fn fixture_flags_exactly_the_two_unsafe_hash_constructions() {
        let source = fixture_source();
        let violations = check_source(&source).expect("fixture should parse");

        assert_eq!(
            violations.len(),
            2,
            "expected exactly 2 violations, got: {violations:#?}"
        );

        let flagged_functions: Vec<&str> = violations
            .iter()
            .map(|v| v.function_name.as_str())
            .collect();
        assert!(flagged_functions.contains(&"computeBridgeMessageHash"));
        assert!(flagged_functions.contains(&"verifyBridgeSignature"));
    }

    #[test]
    fn omitting_chain_id_is_flagged() {
        let source = r#"
            contract C {
                function h(address a, uint256 amt) public pure returns (bytes32) {
                    return keccak256(abi.encodePacked(a, amt));
                }
            }
        "#;
        let violations = check_source(source).expect("should parse");
        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].function_name, "h");
    }

    #[test]
    fn block_chainid_passes() {
        let source = r#"
            contract C {
                function h(address a) public view returns (bytes32) {
                    return keccak256(abi.encodePacked(a, block.chainid));
                }
            }
        "#;
        let violations = check_source(source).expect("should parse");
        assert_eq!(violations.len(), 0, "{violations:#?}");
    }

    #[test]
    fn eip712_domain_separator_with_block_chainid_passes() {
        let source = r#"
            contract C {
                bytes32 constant TYPE_HASH = keccak256("EIP712Domain(string name,uint256 chainId)");

                function domainSeparator() public view returns (bytes32) {
                    return keccak256(
                        abi.encode(
                            TYPE_HASH,
                            keccak256(bytes("MyDapp")),
                            block.chainid
                        )
                    );
                }
            }
        "#;
        let violations = check_source(source).expect("should parse");
        assert_eq!(violations.len(), 0, "{violations:#?}");
    }

    #[test]
    fn explicit_named_chain_id_variable_passes() {
        let source = r#"
            contract C {
                function h(uint256 sourceChainId, uint256 destinationChainId, address a)
                    public
                    pure
                    returns (bytes32)
                {
                    return keccak256(abi.encodePacked(sourceChainId, destinationChainId, a));
                }
            }
        "#;
        let violations = check_source(source).expect("should parse");
        assert_eq!(violations.len(), 0, "{violations:#?}");
    }

    #[test]
    fn invalid_solidity_returns_err() {
        let result = check_source("this is not valid solidity {{{");
        assert!(result.is_err());
    }
}
