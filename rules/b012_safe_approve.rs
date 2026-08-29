// B012: Enforce Safe ERC-20 Approval Handlers
// Flags direct calls to IERC20.approve() that fail to reset allowance to zero
// before assigning a new non-zero allowance value.

pub struct B012SafeApproveRule;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    pub message: String,
    pub line: usize,
}

impl B012SafeApproveRule {
    pub fn new() -> Self {
        Self
    }

    /// Evaluates a block of statements and returns identified issues.
    /// Traverses AST nodes for direct .approve(...) invocation expressions.
    /// Flags instances where approval logic does not reset allowance to 0 first or use safeApprove wrappers.
    pub fn evaluate(&self, statements: &[AstStatement]) -> Vec<Issue> {
        let mut issues = Vec::new();
        let mut previous_was_zero_reset = false;

        for stmt in statements {
            match stmt {
                AstStatement::Expression(expr) => {
                    if let Some(call) = expr.as_function_call() {
                        if call.function_name == "approve" {
                            let is_zero_reset = call.arguments.len() >= 2 && call.arguments[1].is_zero();
                            
                            if !is_zero_reset && !previous_was_zero_reset {
                                issues.push(Issue {
                                    message: "B012: Unsafe ERC-20 approve() call. Must reset allowance to 0 first or use safeApprove/forceApprove.".to_string(),
                                    line: call.line,
                                });
                            }
                            
                            previous_was_zero_reset = is_zero_reset;
                        } else if call.function_name == "safeApprove" || call.function_name == "forceApprove" {
                            previous_was_zero_reset = false;
                        } else {
                            previous_was_zero_reset = false;
                        }
                    } else {
                        previous_was_zero_reset = false;
                    }
                }
                _ => {
                    previous_was_zero_reset = false;
                }
            }
        }

        issues
    }
}

// Dummy AST structures to represent the traversal logic

pub enum AstStatement {
    Expression(AstExpression),
    Other,
}

pub struct AstExpression {
    pub call: Option<FunctionCall>,
}

impl AstExpression {
    pub fn as_function_call(&self) -> Option<&FunctionCall> {
        self.call.as_ref()
    }
}

pub struct FunctionCall {
    pub function_name: String,
    pub arguments: Vec<AstArgument>,
    pub line: usize,
}

pub struct AstArgument {
    pub value: String,
}

impl AstArgument {
    pub fn is_zero(&self) -> bool {
        self.value == "0"
    }
}
