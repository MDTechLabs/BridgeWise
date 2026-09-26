//! Rule B004: Detect Zero-Address Comparisons in Recovered Signatures
//!
//! # What it detects
//!
//! Flags any use of the native `ecrecover` opcode or built-in function that fails to
//! explicitly verify that the returned address is non-zero prior to authorization
//! checks or return.
//!
//! # Why it matters
//!
//! `ecrecover` returns `address(0)` when given malformed or invalid signature
//! parameters (e.g. invalid `v`, `r`, `s` values). If the returned value is compared
//! directly against an uninitialized state variable (which defaults to `address(0)`),
//! an uninitialized local variable, or an empty address parameter, the check succeeds,
//! allowing signature verification bypass.
//!
//! # Remediation
//!
//! Use OpenZeppelin's `ECDSA.recover` library (which includes non-zero assertions
//! and malleability checks), or explicitly check that the recovered address is non-zero:
//!
//! ```solidity
//! address signer = ecrecover(hash, v, r, s);
//! require(signer != address(0), "Invalid signature: zero address");
//! require(signer == expectedSigner, "Unauthorized");
//! ```

use serde::{Deserialize, Serialize};
use solang_parser::parse;
use solang_parser::pt::{
    CatchClause, ContractPart, Expression, FunctionDefinition, HexLiteral, Loc,
    SourceUnitPart, Statement, Type, YulBlock, YulExpression, YulFunctionCall, YulStatement,
};
use std::collections::HashSet;

/// Stable identifier for this rule.
pub const RULE_ID: &str = "B004";
/// Human readable slug used by report renderers.
pub const RULE_NAME: &str = "ecrecover-zero-address";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

/// A single B004 violation finding.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Finding {
    pub rule_id: &'static str,
    pub rule_name: &'static str,
    pub file: String,
    pub line: usize,
    pub function: String,
    pub severity: Severity,
    pub message: String,
}

/// Simplified violation structure compatible with BridgeWise rules engine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Violation {
    pub function_name: String,
    pub line: usize,
    pub message: String,
}

/// Diagnostic structure compatible with JSON output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Diagnostic {
    pub rule_id: String,
    pub message: String,
    pub contract_name: String,
    pub function_name: String,
    pub line: usize,
    pub column: usize,
}

pub struct B004EcrecoverZero;

impl B004EcrecoverZero {
    pub fn new() -> Self {
        Self
    }

    pub fn analyze(source: &str) -> Result<Vec<Diagnostic>, String> {
        let violations = check_source(source)?;
        Ok(violations
            .into_iter()
            .map(|v| Diagnostic {
                rule_id: RULE_ID.to_string(),
                message: v.message,
                contract_name: String::new(),
                function_name: v.function_name,
                line: v.line,
                column: 1,
            })
            .collect())
    }
}

/// Parse `source` as Solidity and run Rule B004 across all functions.
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

/// Run Rule B004 over a single Solidity file path and return Findings.
pub fn analyze(source: &str, file_path: &str) -> Vec<Finding> {
    match check_source(source) {
        Ok(violations) => violations
            .into_iter()
            .map(|v| Finding {
                rule_id: RULE_ID,
                rule_name: RULE_NAME,
                file: file_path.to_string(),
                line: v.line,
                function: v.function_name,
                severity: Severity::High,
                message: v.message,
            })
            .collect(),
        Err(_) => Vec::new(),
    }
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

    let mut var_assignments: Vec<(String, Loc)> = Vec::new();
    let mut inline_ecrecover_calls: Vec<Loc> = Vec::new();
    let mut assembly_ecrecover_calls: Vec<Loc> = Vec::new();
    let mut checked_vars: HashSet<String> = HashSet::new();

    scan_statement(
        body,
        &mut var_assignments,
        &mut inline_ecrecover_calls,
        &mut assembly_ecrecover_calls,
        &mut checked_vars,
    );

    // 1. Check variable-assigned ecrecover calls
    for (var_name, loc) in var_assignments {
        if !checked_vars.contains(&var_name) {
            let line = line_for_loc(source, loc);
            violations.push(Violation {
                function_name: fn_name.clone(),
                line,
                message: format!(
                    "Unsafe `ecrecover` in function `{fn_name}`: recovered address variable `{var_name}` \
                     is not explicitly verified to be non-zero (e.g. `{var_name} != address(0)`). \
                     `ecrecover` returns `address(0)` for invalid signatures, allowing signature bypasses. \
                     Recommend using OpenZeppelin `ECDSA.recover` or asserting `require({var_name} != address(0), \"...\")`."
                ),
            });
        }
    }

    // 2. Check inline ecrecover calls that are not assigned to variables or guarded
    for loc in inline_ecrecover_calls {
        let line = line_for_loc(source, loc);
        violations.push(Violation {
            function_name: fn_name.clone(),
            line,
            message: format!(
                "Unsafe inline `ecrecover` in function `{fn_name}`: result is evaluated without verifying \
                 non-zero return (`!= address(0)`). `ecrecover` returns `address(0)` on malformed signatures. \
                 Recommend using OpenZeppelin `ECDSA.recover` or explicitly checking `!= address(0)`."
            ),
        });
    }

    // 3. Check assembly ecrecover calls lacking zero-checks
    for loc in assembly_ecrecover_calls {
        let line = line_for_loc(source, loc);
        violations.push(Violation {
            function_name: fn_name.clone(),
            line,
            message: format!(
                "Unsafe assembly `ecrecover` in function `{fn_name}`: signature recovery via assembly precompile \
                 fails to explicitly check for zero address result. Recommend checking `iszero(...)` or using \
                 OpenZeppelin `ECDSA.recover`."
            ),
        });
    }
}

fn scan_statement(
    stmt: &Statement,
    var_assignments: &mut Vec<(String, Loc)>,
    inline_ecrecover_calls: &mut Vec<Loc>,
    assembly_ecrecover_calls: &mut Vec<Loc>,
    checked_vars: &mut HashSet<String>,
) {
    match stmt {
        Statement::Block { statements, .. } => {
            for s in statements {
                scan_statement(
                    s,
                    var_assignments,
                    inline_ecrecover_calls,
                    assembly_ecrecover_calls,
                    checked_vars,
                );
            }
        }
        Statement::VariableDefinition(loc, decl, init) => {
            if let Some(init_expr) = init {
                if contains_ecrecover(init_expr) {
                    if let Some(name) = &decl.name {
                        var_assignments.push((name.name.clone(), *loc));
                    }
                } else {
                    scan_for_zero_checks(init_expr, checked_vars);
                }
            }
        }
        Statement::Expression(_loc, expr) => {
            if let Expression::Assign(assign_loc, left, right) = expr {
                if contains_ecrecover(right) {
                    if let Expression::Variable(id) = left.as_ref() {
                        var_assignments.push((id.name.clone(), *assign_loc));
                        return;
                    }
                }
            }
            if is_standalone_ecrecover_expression(expr) {
                if let Some(call_loc) = find_unguarded_inline_ecrecover(expr) {
                    inline_ecrecover_calls.push(call_loc);
                }
            } else {
                scan_for_zero_checks(expr, checked_vars);
            }
        }
        Statement::If(_loc, cond, then_stmt, else_stmt) => {
            // Check if condition is a zero check: `if (signer == address(0))`
            if let Some(var) = is_zero_equality_check(cond) {
                checked_vars.insert(var);
            }
            // Check if condition is a non-zero check: `if (signer != address(0))`
            if let Some(var) = is_non_zero_check(cond) {
                checked_vars.insert(var);
            }

            scan_for_zero_checks(cond, checked_vars);
            if let Some(call_loc) = find_unguarded_inline_ecrecover(cond) {
                inline_ecrecover_calls.push(call_loc);
            }

            scan_statement(
                then_stmt,
                var_assignments,
                inline_ecrecover_calls,
                assembly_ecrecover_calls,
                checked_vars,
            );
            if let Some(e) = else_stmt {
                scan_statement(
                    e,
                    var_assignments,
                    inline_ecrecover_calls,
                    assembly_ecrecover_calls,
                    checked_vars,
                );
            }
        }
        Statement::While(_loc, cond, body) => {
            scan_for_zero_checks(cond, checked_vars);
            if let Some(call_loc) = find_unguarded_inline_ecrecover(cond) {
                inline_ecrecover_calls.push(call_loc);
            }
            scan_statement(
                body,
                var_assignments,
                inline_ecrecover_calls,
                assembly_ecrecover_calls,
                checked_vars,
            );
        }
        Statement::For(_loc, init, cond, update, body) => {
            if let Some(s) = init {
                scan_statement(
                    s,
                    var_assignments,
                    inline_ecrecover_calls,
                    assembly_ecrecover_calls,
                    checked_vars,
                );
            }
            if let Some(c) = cond {
                scan_for_zero_checks(c, checked_vars);
                if let Some(call_loc) = find_unguarded_inline_ecrecover(c) {
                    inline_ecrecover_calls.push(call_loc);
                }
            }
            if let Some(u) = update {
                scan_for_zero_checks(u, checked_vars);
                if let Some(call_loc) = find_unguarded_inline_ecrecover(u) {
                    inline_ecrecover_calls.push(call_loc);
                }
            }
            if let Some(b) = body {
                scan_statement(
                    b,
                    var_assignments,
                    inline_ecrecover_calls,
                    assembly_ecrecover_calls,
                    checked_vars,
                );
            }
        }
        Statement::DoWhile(_loc, body, cond) => {
            scan_statement(
                body,
                var_assignments,
                inline_ecrecover_calls,
                assembly_ecrecover_calls,
                checked_vars,
            );
            scan_for_zero_checks(cond, checked_vars);
            if let Some(call_loc) = find_unguarded_inline_ecrecover(cond) {
                inline_ecrecover_calls.push(call_loc);
            }
        }
        Statement::Return(loc, opt_expr) => {
            if let Some(expr) = opt_expr {
                if contains_ecrecover(expr) {
                    if let Some(call_loc) = find_unguarded_inline_ecrecover(expr) {
                        inline_ecrecover_calls.push(call_loc);
                    } else {
                        inline_ecrecover_calls.push(*loc);
                    }
                }
            }
        }
        Statement::Args(_loc, named_args) => {
            for arg in named_args {
                scan_for_zero_checks(&arg.expr, checked_vars);
                if let Some(call_loc) = find_unguarded_inline_ecrecover(&arg.expr) {
                    inline_ecrecover_calls.push(call_loc);
                }
            }
        }
        Statement::Revert(_loc, _path, args) => {
            for a in args {
                scan_for_zero_checks(a, checked_vars);
            }
        }
        Statement::RevertNamedArgs(_loc, _path, named_args) => {
            for a in named_args {
                scan_for_zero_checks(&a.expr, checked_vars);
            }
        }
        Statement::Emit(_loc, expr) => {
            scan_for_zero_checks(expr, checked_vars);
            if let Some(call_loc) = find_unguarded_inline_ecrecover(expr) {
                inline_ecrecover_calls.push(call_loc);
            }
        }
        Statement::Try(_loc, expr, returns_clause, catches) => {
            scan_for_zero_checks(expr, checked_vars);
            if let Some(call_loc) = find_unguarded_inline_ecrecover(expr) {
                inline_ecrecover_calls.push(call_loc);
            }
            if let Some((_, body)) = returns_clause {
                scan_statement(
                    body,
                    var_assignments,
                    inline_ecrecover_calls,
                    assembly_ecrecover_calls,
                    checked_vars,
                );
            }
            for c in catches {
                match c {
                    CatchClause::Simple(_, _, body) | CatchClause::Named(_, _, _, body) => {
                        scan_statement(
                            body,
                            var_assignments,
                            inline_ecrecover_calls,
                            assembly_ecrecover_calls,
                            checked_vars,
                        );
                    }
                }
            }
        }
        Statement::Assembly { loc, block, .. } => {
            if check_assembly_for_ecrecover(block) {
                assembly_ecrecover_calls.push(*loc);
            }
        }
        Statement::Continue(_) | Statement::Break(_) | Statement::Error(_) => {}
    }
}

fn is_standalone_ecrecover_expression(expr: &Expression) -> bool {
    contains_ecrecover(expr)
}

fn contains_ecrecover(expr: &Expression) -> bool {
    match expr {
        Expression::FunctionCall(_, callee, _) => {
            if is_callee_ecrecover(callee) {
                return true;
            }
            expr_children(expr).into_iter().any(contains_ecrecover)
        }
        _ => expr_children(expr).into_iter().any(contains_ecrecover),
    }
}

fn is_callee_ecrecover(callee: &Expression) -> bool {
    match callee {
        Expression::Variable(id) => id.name == "ecrecover",
        Expression::MemberAccess(_, _, id) => id.name == "ecrecover",
        _ => false,
    }
}

/// Look for inline ecrecover calls that do not perform a `!= address(0)` verification.
fn find_unguarded_inline_ecrecover(expr: &Expression) -> Option<Loc> {
    // If this expression itself is a non-zero check on ecrecover, it is safe!
    if is_ecrecover_non_zero_check(expr) {
        return None;
    }

    match expr {
        Expression::FunctionCall(loc, callee, _) if is_callee_ecrecover(callee) => Some(*loc),
        Expression::And(_, left, right) | Expression::Or(_, left, right) => {
            // If either side is a non-zero check on ecrecover, the ecrecover call is guarded
            if is_ecrecover_non_zero_check(left) || is_ecrecover_non_zero_check(right) {
                None
            } else {
                find_unguarded_inline_ecrecover(left)
                    .or_else(|| find_unguarded_inline_ecrecover(right))
            }
        }
        Expression::Parenthesis(_, inner) => find_unguarded_inline_ecrecover(inner),
        _ => {
            for child in expr_children(expr) {
                if let Some(loc) = find_unguarded_inline_ecrecover(child) {
                    return Some(loc);
                }
            }
            None
        }
    }
}

fn is_ecrecover_non_zero_check(expr: &Expression) -> bool {
    match expr {
        Expression::NotEqual(_, left, right) => {
            (contains_ecrecover(left) && is_zero_literal(right))
                || (contains_ecrecover(right) && is_zero_literal(left))
        }
        Expression::Not(_, inner) => match inner.as_ref() {
            Expression::Equal(_, left, right) => {
                (contains_ecrecover(left) && is_zero_literal(right))
                    || (contains_ecrecover(right) && is_zero_literal(left))
            }
            _ => false,
        },
        Expression::Parenthesis(_, inner) => is_ecrecover_non_zero_check(inner),
        Expression::And(_, left, right) => {
            is_ecrecover_non_zero_check(left) || is_ecrecover_non_zero_check(right)
        }
        _ => false,
    }
}

/// Recursively scans an expression to find checks like `v != address(0)` or `require(v != address(0))`
fn scan_for_zero_checks(expr: &Expression, checked_vars: &mut HashSet<String>) {
    if let Some(var) = is_non_zero_check(expr) {
        checked_vars.insert(var);
    }
    for child in expr_children(expr) {
        scan_for_zero_checks(child, checked_vars);
    }
}

fn is_non_zero_check(expr: &Expression) -> Option<String> {
    match expr {
        Expression::NotEqual(_, left, right) => {
            if is_zero_literal(right) {
                get_variable_name(left)
            } else if is_zero_literal(left) {
                get_variable_name(right)
            } else {
                None
            }
        }
        Expression::Not(_, inner) => match inner.as_ref() {
            Expression::Equal(_, left, right) => {
                if is_zero_literal(right) {
                    get_variable_name(left)
                } else if is_zero_literal(left) {
                    get_variable_name(right)
                } else {
                    None
                }
            }
            _ => None,
        },
        Expression::More(_, left, right) => {
            if is_zero_literal(right) {
                get_variable_name(left)
            } else {
                None
            }
        }
        Expression::Parenthesis(_, inner) => is_non_zero_check(inner),
        _ => None,
    }
}

fn is_zero_equality_check(expr: &Expression) -> Option<String> {
    match expr {
        Expression::Equal(_, left, right) => {
            if is_zero_literal(right) {
                get_variable_name(left)
            } else if is_zero_literal(left) {
                get_variable_name(right)
            } else {
                None
            }
        }
        Expression::Parenthesis(_, inner) => is_zero_equality_check(inner),
        _ => None,
    }
}

fn get_variable_name(expr: &Expression) -> Option<String> {
    match expr {
        Expression::Variable(id) => Some(id.name.clone()),
        Expression::Parenthesis(_, inner) => get_variable_name(inner),
        Expression::Type(_, _) => None,
        _ => None,
    }
}

fn is_zero_literal(expr: &Expression) -> bool {
    match expr {
        Expression::NumberLiteral(_, val, _, _) => {
            val == "0" || val == "0x0" || val.chars().all(|c| c == '0' || c == 'x' || c == 'X')
        }
        Expression::HexNumberLiteral(_, val, _) => val.trim_start_matches("0x").chars().all(|c| c == '0'),
        Expression::HexLiteral(hexes) => hexes.iter().all(|h: &HexLiteral| h.hex.chars().all(|c| c == '0')),
        Expression::AddressLiteral(_, val) => {
            val.trim_start_matches("0x").chars().all(|c| c == '0')
        }
        Expression::FunctionCall(_, callee, args) => {
            if args.len() == 1 {
                let is_cast = match callee.as_ref() {
                    Expression::Type(_, Type::Address) => true,
                    Expression::Variable(id) => {
                        id.name == "address" || id.name == "bytes20" || id.name == "uint160"
                    }
                    _ => false,
                };
                if is_cast {
                    return is_zero_literal(&args[0]);
                }
            }
            false
        }
        Expression::Parenthesis(_, inner) => is_zero_literal(inner),
        _ => false,
    }
}

fn check_assembly_for_ecrecover(block: &YulBlock) -> bool {
    let mut has_ecrecover_call = false;
    let mut has_iszero_check = false;

    for stmt in &block.statements {
        scan_yul_statement(stmt, &mut has_ecrecover_call, &mut has_iszero_check);
    }

    has_ecrecover_call && !has_iszero_check
}

fn scan_yul_statement(
    stmt: &YulStatement,
    has_ecrecover: &mut bool,
    has_iszero: &mut bool,
) {
    match stmt {
        YulStatement::FunctionCall(call) => {
            check_yul_call(call, has_ecrecover, has_iszero);
        }
        YulStatement::Assign(_, _, expr) | YulStatement::VariableDeclaration(_, _, Some(expr)) => {
            check_yul_expr(expr, has_ecrecover, has_iszero);
        }
        YulStatement::If(_, expr, block) => {
            check_yul_expr(expr, has_ecrecover, has_iszero);
            for s in &block.statements {
                scan_yul_statement(s, has_ecrecover, has_iszero);
            }
        }
        YulStatement::Block(b) => {
            for s in &b.statements {
                scan_yul_statement(s, has_ecrecover, has_iszero);
            }
        }
        _ => {}
    }
}

fn check_yul_expr(expr: &YulExpression, has_ecrecover: &mut bool, has_iszero: &mut bool) {
    match expr {
        YulExpression::FunctionCall(call) => {
            check_yul_call(call, has_ecrecover, has_iszero);
        }
        _ => {}
    }
}

fn check_yul_call(call: &YulFunctionCall, has_ecrecover: &mut bool, has_iszero: &mut bool) {
    if call.id.name == "ecrecover" {
        *has_ecrecover = true;
    } else if call.id.name == "staticcall" {
        // Precompile address 1 is ecrecover
        if let Some(second_arg) = call.arguments.get(1) {
            if let YulExpression::NumberLiteral(_, val, _, _) = second_arg {
                if val == "1" {
                    *has_ecrecover = true;
                }
            }
        }
    } else if call.id.name == "iszero" || call.id.name == "gt" {
        *has_iszero = true;
    }

    for arg in &call.arguments {
        check_yul_expr(arg, has_ecrecover, has_iszero);
    }
}

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

    fn fixture_source() -> String {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let candidate_1 = manifest_dir.join("test").join("fixtures").join("b004_samples.sol");
        let candidate_2 = manifest_dir.join("..").join("test").join("fixtures").join("b004_samples.sol");
        if candidate_1.exists() {
            std::fs::read_to_string(&candidate_1).expect("read candidate_1")
        } else if candidate_2.exists() {
            std::fs::read_to_string(&candidate_2).expect("read candidate_2")
        } else {
            panic!("fixture b004_samples.sol not found");
        }
    }

    #[test]
    fn fixture_parses_and_flags_all_vulnerabilities() {
        let source = fixture_source();
        let violations = check_source(&source).expect("fixture should parse");

        let flagged_funcs: Vec<&str> = violations
            .iter()
            .map(|v| v.function_name.as_str())
            .collect();

        assert!(
            flagged_funcs.contains(&"verifySignatureUnchecked"),
            "should flag verifySignatureUnchecked"
        );
        assert!(
            flagged_funcs.contains(&"executeAsAdmin"),
            "should flag executeAsAdmin"
        );
        assert!(
            flagged_funcs.contains(&"recoverSigner"),
            "should flag recoverSigner"
        );
        assert!(
            flagged_funcs.contains(&"executeIfValidator"),
            "should flag executeIfValidator"
        );
        assert!(
            flagged_funcs.contains(&"recoverAssembly"),
            "should flag recoverAssembly"
        );

        // Safe functions in B004Safe contract must NOT be flagged
        assert!(
            !flagged_funcs.contains(&"verifyGuardedRequire"),
            "verifyGuardedRequire should not be flagged"
        );
        assert!(
            !flagged_funcs.contains(&"verifyCombinedRequire"),
            "verifyCombinedRequire should not be flagged"
        );
        assert!(
            !flagged_funcs.contains(&"verifyGuardedRevert"),
            "verifyGuardedRevert should not be flagged"
        );
        assert!(
            !flagged_funcs.contains(&"verifyInlineGuarded"),
            "verifyInlineGuarded should not be flagged"
        );
        assert!(
            !flagged_funcs.contains(&"verifyECDSA"),
            "verifyECDSA should not be flagged"
        );
        assert!(
            !flagged_funcs.contains(&"verifyECDSAMember"),
            "verifyECDSAMember should not be flagged"
        );
        assert!(
            !flagged_funcs.contains(&"setAdmin"),
            "setAdmin should not be flagged"
        );

        assert_eq!(violations.len(), 5, "expected exactly 5 violations in fixture");
    }

    #[test]
    fn direct_comparison_without_zero_check_flagged() {
        let source = r#"
            contract C {
                function v(bytes32 hash, uint8 v, bytes32 r, bytes32 s, address expected) public pure returns (bool) {
                    address signer = ecrecover(hash, v, r, s);
                    return signer == expected;
                }
            }
        "#;
        let violations = check_source(source).expect("should parse");
        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].function_name, "v");
        assert!(violations[0].message.contains("OpenZeppelin `ECDSA.recover`"));
    }

    #[test]
    fn guarded_with_require_passes() {
        let source = r#"
            contract C {
                function v(bytes32 hash, uint8 v, bytes32 r, bytes32 s, address expected) public pure returns (bool) {
                    address signer = ecrecover(hash, v, r, s);
                    require(signer != address(0), "zero");
                    return signer == expected;
                }
            }
        "#;
        let violations = check_source(source).expect("should parse");
        assert_eq!(violations.len(), 0);
    }

    #[test]
    fn guarded_with_revert_passes() {
        let source = r#"
            contract C {
                error Zero();
                function v(bytes32 hash, uint8 v, bytes32 r, bytes32 s, address expected) public pure returns (bool) {
                    address signer = ecrecover(hash, v, r, s);
                    if (signer == address(0)) revert Zero();
                    return signer == expected;
                }
            }
        "#;
        let violations = check_source(source).expect("should parse");
        assert_eq!(violations.len(), 0);
    }

    #[test]
    fn openzeppelin_ecdsa_call_passes() {
        let source = r#"
            library ECDSA {
                function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
                    return address(1);
                }
            }
            contract C {
                function v(bytes32 hash, bytes memory sig, address expected) public pure returns (bool) {
                    address signer = ECDSA.recover(hash, sig);
                    return signer == expected;
                }
            }
        "#;
        let violations = check_source(source).expect("should parse");
        assert_eq!(violations.len(), 0);
    }

    #[test]
    fn invalid_solidity_returns_error() {
        let result = check_source("contract { invalid");
        assert!(result.is_err());
    }
}
