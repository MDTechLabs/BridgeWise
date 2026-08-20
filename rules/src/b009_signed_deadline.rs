//! Rule B009: enforce expiration checks on signed cross-chain messages.

use solang_parser::parse;
use solang_parser::pt::{ContractPart, Expression, FunctionDefinition, SourceUnitPart, Statement};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    pub function_name: String,
    pub line: usize,
    pub message: String,
}

pub fn check_source(source: &str) -> Result<Vec<Violation>, String> {
    let (tree, _) = parse(source, 0)
        .map_err(|diagnostics| format!("failed to parse Solidity source: {diagnostics:?}"))?;
    let mut violations = Vec::new();

    for part in &tree.0 {
        match part {
            SourceUnitPart::ContractDefinition(contract) => {
                for contract_part in &contract.parts {
                    if let ContractPart::FunctionDefinition(function) = contract_part {
                        check_function(function, source, &mut violations);
                    }
                }
            }
            SourceUnitPart::FunctionDefinition(function) => check_function(function, source, &mut violations),
            _ => {}
        }
    }

    Ok(violations)
}

fn check_function(function: &FunctionDefinition, source: &str, violations: &mut Vec<Violation>) {
    let function_name = function
        .name
        .as_ref()
        .map(|identifier| identifier.name.clone())
        .unwrap_or_else(|| "<unnamed>".to_string());
    let Some(body) = &function.body else { return };

    let mut expressions = Vec::new();
    collect_expressions(body, &mut expressions);
    let signed_verification = function_name.to_ascii_lowercase().contains("verify")
        || function_name.to_ascii_lowercase().contains("signature")
        || expressions.iter().any(|expression| contains_call_named(expression, &["ecrecover", "recover"]));
    if !signed_verification {
        return;
    }

    let has_deadline = expressions.iter().any(|expression| contains_deadline_ref(expression));
    let has_expiration_guard = expressions.iter().any(|expression| contains_expiration_guard(expression));
    if has_deadline && has_expiration_guard {
        return;
    }

    let line = expressions
        .first()
        .map(|expression| line_for_expression(source, expression))
        .unwrap_or(0);
    let missing = match (has_deadline, has_expiration_guard) {
        (false, false) => "a deadline payload field and a block.timestamp <= deadline guard",
        (false, true) => "a deadline or expiration field in the signed payload",
        (true, false) => "a block.timestamp <= deadline guard before verification",
        (true, true) => unreachable!(),
    };
    violations.push(Violation {
        function_name: function_name.clone(),
        line,
        message: format!("signed message verification in `{function_name}` is missing {missing}"),
    });
}

fn collect_expressions<'a>(statement: &'a Statement, output: &mut Vec<&'a Expression>) {
    match statement {
        Statement::Block { statements, .. } => statements.iter().for_each(|statement| collect_expressions(statement, output)),
        Statement::If(_, condition, then_statement, else_statement) => {
            output.push(condition);
            collect_expressions(then_statement, output);
            if let Some(else_statement) = else_statement { collect_expressions(else_statement, output); }
        }
        Statement::While(_, condition, body) => { output.push(condition); collect_expressions(body, output); }
        Statement::For(_, init, condition, update, body) => {
            if let Some(init) = init { collect_expressions(init, output); }
            if let Some(condition) = condition { output.push(condition); }
            if let Some(update) = update { output.push(update); }
            if let Some(body) = body { collect_expressions(body, output); }
        }
        Statement::DoWhile(_, body, condition) => { collect_expressions(body, output); output.push(condition); }
        Statement::Expression(_, expression) | Statement::Return(_, Some(expression)) => output.push(expression),
        Statement::VariableDefinition(_, _, Some(expression)) => output.push(expression),
        Statement::Args(_, args) => args.iter().for_each(|arg| output.push(&arg.expr)),
        Statement::Revert(_, _, args) => args.iter().for_each(|arg| output.push(arg)),
        Statement::RevertNamedArgs(_, _, args) => args.iter().for_each(|arg| output.push(&arg.expr)),
        Statement::Emit(_, expression) | Statement::Try(_, expression, _, _) => output.push(expression),
        Statement::Continue(_) | Statement::Break(_) | Statement::Error(_) | Statement::Assembly { .. }
        | Statement::VariableDefinition(_, _, None) | Statement::Return(_, None) => {}
    }
}

fn expression_children(expression: &Expression) -> Vec<&Expression> {
    use Expression::*;
    match expression {
        MemberAccess(_, value, _) | Parenthesis(_, value) | Not(_, value) | BitwiseNot(_, value)
        | Delete(_, value) | PreIncrement(_, value) | PreDecrement(_, value) | UnaryPlus(_, value)
        | Negate(_, value) | PostIncrement(_, value) | PostDecrement(_, value) | New(_, value) => vec![value],
        FunctionCall(_, callee, arguments) => std::iter::once(callee.as_ref()).chain(arguments.iter()).collect(),
        NamedFunctionCall(_, callee, arguments) => std::iter::once(callee.as_ref()).chain(arguments.iter().map(|arg| &arg.expr)).collect(),
        Power(_, left, right) | Multiply(_, left, right) | Divide(_, left, right) | Modulo(_, left, right)
        | Add(_, left, right) | Subtract(_, left, right) | ShiftLeft(_, left, right) | ShiftRight(_, left, right)
        | BitwiseAnd(_, left, right) | BitwiseXor(_, left, right) | BitwiseOr(_, left, right)
        | Less(_, left, right) | More(_, left, right) | LessEqual(_, left, right) | MoreEqual(_, left, right)
        | Equal(_, left, right) | NotEqual(_, left, right) | And(_, left, right) | Or(_, left, right)
        | Assign(_, left, right) | AssignOr(_, left, right) | AssignAnd(_, left, right) | AssignXor(_, left, right)
        | AssignShiftLeft(_, left, right) | AssignShiftRight(_, left, right) | AssignAdd(_, left, right)
        | AssignSubtract(_, left, right) | AssignMultiply(_, left, right) | AssignDivide(_, left, right)
        | AssignModulo(_, left, right) => vec![left, right],
        ConditionalOperator(_, condition, when_true, when_false) => vec![condition, when_true, when_false],
        ArraySubscript(_, array, index) => std::iter::once(array.as_ref()).chain(index.as_deref()).collect(),
        ArraySlice(_, array, start, end) => std::iter::once(array.as_ref()).chain(start.as_deref()).chain(end.as_deref()).collect(),
        ArrayLiteral(_, values) => values.iter().collect(),
        List(_, values) => values.iter().filter_map(|(_, value)| value.as_ref().map(|value| &value.ty)).collect(),
        _ => vec![],
    }
}

fn contains_call_named(expression: &Expression, names: &[&str]) -> bool {
    if let Expression::FunctionCall(_, callee, _) = expression {
        if let Expression::Variable(identifier) | Expression::MemberAccess(_, _, identifier) = callee.as_ref() {
            if names.iter().any(|name| identifier.name.eq_ignore_ascii_case(name)) { return true; }
        }
    }
    expression_children(expression).into_iter().any(|child| contains_call_named(child, names))
}

fn contains_deadline_ref(expression: &Expression) -> bool {
    match expression {
        Expression::Variable(identifier) | Expression::MemberAccess(_, _, identifier) => {
            let name = identifier.name.to_ascii_lowercase();
            name.contains("deadline") || name.contains("expiry") || name.contains("expiration")
        }
        _ => expression_children(expression).into_iter().any(contains_deadline_ref),
    }
}

fn contains_expiration_guard(expression: &Expression) -> bool {
    match expression {
        Expression::LessEqual(_, left, right) => {
            (is_block_timestamp(left) && contains_deadline_ref(right))
                || (is_block_timestamp(right) && contains_deadline_ref(left))
                || expression_children(expression).into_iter().any(contains_expiration_guard)
        }
        _ => expression_children(expression).into_iter().any(contains_expiration_guard),
    }
}

fn is_block_timestamp(expression: &Expression) -> bool {
    matches!(expression, Expression::MemberAccess(_, base, member)
        if member.name.eq_ignore_ascii_case("timestamp")
            && matches!(base.as_ref(), Expression::Variable(identifier) if identifier.name.eq_ignore_ascii_case("block")))
}

fn line_for_expression(source: &str, expression: &Expression) -> usize {
    let loc = match expression {
        Expression::Variable(identifier) => identifier.loc,
        Expression::MemberAccess(loc, _, _) | Expression::FunctionCall(loc, _, _)
        | Expression::LessEqual(loc, _, _) => *loc,
        _ => return 0,
    };
    match loc {
        solang_parser::pt::Loc::File(_, start, _) => source[..start.min(source.len())].matches('\n').count() + 1,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_signed_message_without_deadline_guard() {
        let source = r#"contract Sample { function verify(bytes32 payload, bytes calldata signature) external returns (bool) { return ecrecover(payload, 27, bytes32(0), bytes32(0)) != address(0); } }"#;
        let violations = check_source(source).unwrap();
        assert_eq!(violations.len(), 1);
    }

    #[test]
    fn accepts_deadline_field_and_timestamp_guard() {
        let source = r#"contract Sample { function verify(bytes32 payload, uint256 deadline, bytes calldata signature) external returns (bool) { require(block.timestamp <= deadline, "expired"); return ecrecover(payload, 27, bytes32(0), bytes32(0)) != address(0); } }"#;
        assert!(check_source(source).unwrap().is_empty());
    }
}