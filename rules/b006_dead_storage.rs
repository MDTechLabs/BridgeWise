use serde::{Deserialize, Serialize};
use solang_parser::pt::{
    CatchClause, ContractDefinition, ContractPart, Expression, FunctionAttribute,
    FunctionDefinition, Loc, Statement, VariableAttribute, Visibility,
};
use std::collections::HashSet;

/// Diagnostic issue reported by Rule B006.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Diagnostic {
    pub rule_id: String,
    pub message: String,
    pub contract_name: String,
    pub variable_name: String,
    pub line: usize,
    pub column: usize,
}

/// Rule B006: Identifies dead (unread and unwritten) storage state variables declared inside bridge contracts.
pub struct B006DeadStorage;

struct StateVarInfo {
    name: String,
    loc: Loc,
    referenced: bool,
}

impl B006DeadStorage {
    /// Analyzes Solidity source code and returns a list of diagnostics for dead storage variables.
    pub fn analyze(source: &str) -> Result<Vec<Diagnostic>, String> {
        let (source_unit, _comments) = solang_parser::parse(source, 0)
            .map_err(|diags| format!("Solidity parse error: {:?}", diags))?;

        let mut diagnostics = Vec::new();

        for part in &source_unit.0 {
            if let solang_parser::pt::SourceUnitPart::ContractDefinition(contract) = part {
                let contract_diags = Self::analyze_contract(contract, source);
                diagnostics.extend(contract_diags);
            }
        }

        Ok(diagnostics)
    }

    fn analyze_contract(contract: &ContractDefinition, source: &str) -> Vec<Diagnostic> {
        let contract_name = contract
            .name
            .as_ref()
            .map(|id| id.name.clone())
            .unwrap_or_else(|| "UnknownContract".to_string());

        let mut state_vars: Vec<StateVarInfo> = Vec::new();

        // 1. Collect state variable declarations
        for part in &contract.parts {
            if let ContractPart::VariableDefinition(var_def) = part {
                if let Some(id) = &var_def.name {
                    let is_public = var_def.attrs.iter().any(|attr| {
                        matches!(attr, VariableAttribute::Visibility(Visibility::Public(_)))
                    });

                    state_vars.push(StateVarInfo {
                        name: id.name.clone(),
                        loc: var_def.loc,
                        referenced: is_public, // Public getters auto-reference state variables
                    });
                }
            }
        }

        if state_vars.is_empty() {
            return Vec::new();
        }

        let state_var_names: HashSet<String> = state_vars.iter().map(|v| v.name.clone()).collect();
        let mut referenced_names: HashSet<String> = HashSet::new();

        // 2. Scan initializers of state variables for references
        for part in &contract.parts {
            if let ContractPart::VariableDefinition(var_def) = part {
                if let Some(ref init) = var_def.initializer {
                    Self::scan_expression(init, &state_var_names, &HashSet::new(), &mut referenced_names);
                }
            }
        }

        // 3. Scan function definitions (functions, constructors, modifiers, fallbacks)
        for part in &contract.parts {
            if let ContractPart::FunctionDefinition(func) = part {
                Self::scan_function(func, &state_var_names, &mut referenced_names);
            }
        }

        // 4. Update referenced status
        for var in &mut state_vars {
            if referenced_names.contains(&var.name) {
                var.referenced = true;
            }
        }

        // 5. Generate diagnostics for unreferenced non-public variables
        let mut diagnostics = Vec::new();
        for var in &state_vars {
            if !var.referenced {
                let (line, column) = Self::loc_to_line_col(var.loc, source);
                diagnostics.push(Diagnostic {
                    rule_id: "B006".to_string(),
                    message: format!(
                        "Dead storage declaration: variable '{}' in contract '{}' is declared but never referenced.",
                        var.name, contract_name
                    ),
                    contract_name: contract_name.clone(),
                    variable_name: var.name.clone(),
                    line,
                    column,
                });
            }
        }

        diagnostics
    }

    fn scan_function(
        func: &FunctionDefinition,
        state_var_names: &HashSet<String>,
        referenced_names: &mut HashSet<String>,
    ) {
        let mut local_scope = HashSet::new();

        // Parameters
        for param in &func.params {
            if let Some(ref p) = param.1 {
                if let Some(ref id) = p.name {
                    local_scope.insert(id.name.clone());
                }
            }
        }

        // Returns
        for ret in &func.returns {
            if let Some(ref p) = ret.1 {
                if let Some(ref id) = p.name {
                    local_scope.insert(id.name.clone());
                }
            }
        }

        // Function modifiers invocation arguments
        for attr in &func.attributes {
            if let FunctionAttribute::BaseOrModifier(_, base) = attr {
                if let Some(ref args) = base.args {
                    for arg in args {
                        Self::scan_expression(arg, state_var_names, &local_scope, referenced_names);
                    }
                }
            }
        }

        // Function body statement
        if let Some(ref stmt) = func.body {
            Self::scan_statement(stmt, state_var_names, &mut local_scope, referenced_names);
        }
    }

    fn scan_statement(
        stmt: &Statement,
        state_var_names: &HashSet<String>,
        local_scope: &mut HashSet<String>,
        referenced_names: &mut HashSet<String>,
    ) {
        match stmt {
            Statement::Block { statements, .. } => {
                let mut inner_scope = local_scope.clone();
                for s in statements {
                    Self::scan_statement(s, state_var_names, &mut inner_scope, referenced_names);
                }
            }
            Statement::Assembly { .. } => {}
            Statement::Args(_, args) => {
                for arg in args {
                    Self::scan_expression(&arg.expr, state_var_names, local_scope, referenced_names);
                }
            }
            Statement::If(_, expr, then_stmt, else_stmt) => {
                Self::scan_expression(expr, state_var_names, local_scope, referenced_names);
                Self::scan_statement(then_stmt, state_var_names, &mut local_scope.clone(), referenced_names);
                if let Some(else_s) = else_stmt {
                    Self::scan_statement(else_s, state_var_names, &mut local_scope.clone(), referenced_names);
                }
            }
            Statement::While(_, expr, body) => {
                Self::scan_expression(expr, state_var_names, local_scope, referenced_names);
                Self::scan_statement(body, state_var_names, &mut local_scope.clone(), referenced_names);
            }
            Statement::For(_, init, cond, next, body) => {
                let mut for_scope = local_scope.clone();
                if let Some(init_s) = init {
                    Self::scan_statement(init_s, state_var_names, &mut for_scope, referenced_names);
                }
                if let Some(cond_e) = cond {
                    Self::scan_expression(cond_e, state_var_names, &for_scope, referenced_names);
                }
                if let Some(next_e) = next {
                    Self::scan_expression(next_e, state_var_names, &for_scope, referenced_names);
                }
                if let Some(body_s) = body {
                    Self::scan_statement(body_s, state_var_names, &mut for_scope, referenced_names);
                }
            }
            Statement::DoWhile(_, body, expr) => {
                Self::scan_statement(body, state_var_names, &mut local_scope.clone(), referenced_names);
                Self::scan_expression(expr, state_var_names, local_scope, referenced_names);
            }
            Statement::Expression(_, expr) => {
                Self::scan_expression(expr, state_var_names, local_scope, referenced_names);
            }
            Statement::VariableDefinition(_, var_decl, init) => {
                if let Some(init_expr) = init {
                    Self::scan_expression(init_expr, state_var_names, local_scope, referenced_names);
                }
                if let Some(id) = &var_decl.name {
                    local_scope.insert(id.name.clone());
                }
            }
            Statement::Return(_, expr_opt) => {
                if let Some(expr) = expr_opt {
                    Self::scan_expression(expr, state_var_names, local_scope, referenced_names);
                }
            }
            Statement::Revert(_, _, exprs) => {
                for expr in exprs {
                    Self::scan_expression(expr, state_var_names, local_scope, referenced_names);
                }
            }
            Statement::RevertNamedArgs(_, _, args) => {
                for arg in args {
                    Self::scan_expression(&arg.expr, state_var_names, local_scope, referenced_names);
                }
            }
            Statement::Emit(_, expr) => {
                Self::scan_expression(expr, state_var_names, local_scope, referenced_names);
            }
            Statement::Try(_, expr, returns, clauses) => {
                Self::scan_expression(expr, state_var_names, local_scope, referenced_names);
                if let Some((params, stmt)) = returns {
                    let mut try_scope = local_scope.clone();
                    for p in params {
                        if let Some(param) = &p.1 {
                            if let Some(ref id) = param.name {
                                try_scope.insert(id.name.clone());
                            }
                        }
                    }
                    Self::scan_statement(stmt, state_var_names, &mut try_scope, referenced_names);
                }
                for clause in clauses {
                    let mut clause_scope = local_scope.clone();
                    match clause {
                        CatchClause::Simple(_, param_opt, body) => {
                            if let Some(param) = param_opt {
                                if let Some(ref id) = param.name {
                                    clause_scope.insert(id.name.clone());
                                }
                            }
                            Self::scan_statement(body, state_var_names, &mut clause_scope, referenced_names);
                        }
                        CatchClause::Named(_, _id, param, body) => {
                            if let Some(ref id) = param.name {
                                clause_scope.insert(id.name.clone());
                            }
                            Self::scan_statement(body, state_var_names, &mut clause_scope, referenced_names);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn scan_expression(
        expr: &Expression,
        state_var_names: &HashSet<String>,
        local_scope: &HashSet<String>,
        referenced_names: &mut HashSet<String>,
    ) {
        match expr {
            Expression::Variable(id) => {
                if !local_scope.contains(&id.name) && state_var_names.contains(&id.name) {
                    referenced_names.insert(id.name.clone());
                }
            }
            Expression::MemberAccess(_, inner, _id) => {
                Self::scan_expression(inner, state_var_names, local_scope, referenced_names);
            }
            Expression::ArraySubscript(_, inner, index) => {
                Self::scan_expression(inner, state_var_names, local_scope, referenced_names);
                if let Some(idx) = index {
                    Self::scan_expression(idx, state_var_names, local_scope, referenced_names);
                }
            }
            Expression::Assign(_, lhs, rhs)
            | Expression::AssignAdd(_, lhs, rhs)
            | Expression::AssignSubtract(_, lhs, rhs)
            | Expression::AssignMultiply(_, lhs, rhs)
            | Expression::AssignDivide(_, lhs, rhs)
            | Expression::AssignModulo(_, lhs, rhs)
            | Expression::AssignAnd(_, lhs, rhs)
            | Expression::AssignOr(_, lhs, rhs)
            | Expression::AssignXor(_, lhs, rhs)
            | Expression::AssignShiftLeft(_, lhs, rhs)
            | Expression::AssignShiftRight(_, lhs, rhs)
            | Expression::Power(_, lhs, rhs)
            | Expression::Multiply(_, lhs, rhs)
            | Expression::Divide(_, lhs, rhs)
            | Expression::Modulo(_, lhs, rhs)
            | Expression::Add(_, lhs, rhs)
            | Expression::Subtract(_, lhs, rhs)
            | Expression::ShiftLeft(_, lhs, rhs)
            | Expression::ShiftRight(_, lhs, rhs)
            | Expression::BitwiseAnd(_, lhs, rhs)
            | Expression::BitwiseXor(_, lhs, rhs)
            | Expression::BitwiseOr(_, lhs, rhs)
            | Expression::Less(_, lhs, rhs)
            | Expression::More(_, lhs, rhs)
            | Expression::LessEqual(_, lhs, rhs)
            | Expression::MoreEqual(_, lhs, rhs)
            | Expression::Equal(_, lhs, rhs)
            | Expression::NotEqual(_, lhs, rhs)
            | Expression::And(_, lhs, rhs)
            | Expression::Or(_, lhs, rhs) => {
                Self::scan_expression(lhs, state_var_names, local_scope, referenced_names);
                Self::scan_expression(rhs, state_var_names, local_scope, referenced_names);
            }
            Expression::FunctionCall(_, func, args) => {
                Self::scan_expression(func, state_var_names, local_scope, referenced_names);
                for arg in args {
                    Self::scan_expression(arg, state_var_names, local_scope, referenced_names);
                }
            }
            Expression::NamedFunctionCall(_, func, args) => {
                Self::scan_expression(func, state_var_names, local_scope, referenced_names);
                for arg in args {
                    Self::scan_expression(&arg.expr, state_var_names, local_scope, referenced_names);
                }
            }
            Expression::PostIncrement(_, inner)
            | Expression::PostDecrement(_, inner)
            | Expression::PreIncrement(_, inner)
            | Expression::PreDecrement(_, inner)
            | Expression::UnaryPlus(_, inner)
            | Expression::Negate(_, inner)
            | Expression::Not(_, inner)
            | Expression::BitwiseNot(_, inner)
            | Expression::Delete(_, inner)
            | Expression::New(_, inner)
            | Expression::Parenthesis(_, inner) => {
                Self::scan_expression(inner, state_var_names, local_scope, referenced_names);
            }
            Expression::ArrayLiteral(_, exprs) => {
                for e in exprs {
                    Self::scan_expression(e, state_var_names, local_scope, referenced_names);
                }
            }
            _ => {}
        }
    }

    fn loc_to_line_col(loc: Loc, source: &str) -> (usize, usize) {
        match loc {
            Loc::File(_, start, _) => {
                let mut line = 1;
                let mut col = 1;
                for (i, ch) in source.char_indices() {
                    if i >= start {
                        break;
                    }
                    if ch == '\n' {
                        line += 1;
                        col = 1;
                    } else {
                        col += 1;
                    }
                }
                (line, col)
            }
            _ => (1, 1),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_b006_samples_fixture() {
        let fixture_path = "test/fixtures/b006_samples.sol";
        let source = std::fs::read_to_string(fixture_path)
            .unwrap_or_else(|_| panic!("Failed to read fixture at {}", fixture_path));

        let diagnostics = B006DeadStorage::analyze(&source).expect("Failed to analyze source");

        // DeadStorageBridge should trigger 3 dead storage diagnostics:
        // 1. unusedConfigValue
        // 2. deadHash
        // 3. unusedMapping
        let dead_vars: Vec<String> = diagnostics
            .iter()
            .filter(|d| d.contract_name == "DeadStorageBridge")
            .map(|d| d.variable_name.clone())
            .collect();

        assert_eq!(
            dead_vars,
            vec!["unusedConfigValue", "deadHash", "unusedMapping"],
            "DeadStorageBridge should correctly identify all 3 dead storage variables"
        );

        // ActiveStorageBridge should trigger 0 diagnostics
        let active_vars: Vec<String> = diagnostics
            .iter()
            .filter(|d| d.contract_name == "ActiveStorageBridge")
            .map(|d| d.variable_name.clone())
            .collect();

        assert!(
            active_vars.is_empty(),
            "ActiveStorageBridge should have zero dead storage declarations"
        );
    }

    #[test]
    fn test_public_getters_and_referenced_variables() {
        let source = r#"
            // SPDX-License-Identifier: MIT
            pragma solidity ^0.8.20;

            contract BridgeVault {
                uint256 public totalLiquidity;
                address private vaultOwner;

                constructor(address _owner) {
                    vaultOwner = _owner;
                }

                function getOwner() external view returns (address) {
                    return vaultOwner;
                }
            }
        "#;

        let diagnostics = B006DeadStorage::analyze(source).expect("Analysis failed");
        assert!(diagnostics.is_empty(), "Expected no dead storage diagnostics");
    }

    #[test]
    fn test_shadowing_and_unreferenced_var() {
        let source = r#"
            // SPDX-License-Identifier: MIT
            pragma solidity ^0.8.20;

            contract ShadowBridge {
                uint256 private deadVal;
                uint256 private shadowVal;

                function test(uint256 shadowVal) external pure returns (uint256) {
                    return shadowVal; // references parameter, not state variable
                }
            }
        "#;

        let diagnostics = B006DeadStorage::analyze(source).expect("Analysis failed");
        let dead_names: Vec<String> = diagnostics.into_iter().map(|d| d.variable_name).collect();
        assert!(dead_names.contains(&"deadVal".to_string()));
        assert!(dead_names.contains(&"shadowVal".to_string()));
    }
}
