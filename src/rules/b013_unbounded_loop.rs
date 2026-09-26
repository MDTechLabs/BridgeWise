//! Rule B013: Flag Dynamic Storage Array Iterations in Fee Calculations
//!
//! Analyzes AST loop nodes reading length properties of dynamic storage array variables
//! without explicit pagination bounds or fixed iteration limits.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticIssue {
    pub rule_id: String,
    pub title: String,
    pub description: String,
    pub line_number: usize,
    pub severity: Severity,
}

pub struct RuleB013UnboundedLoop;

impl RuleB013UnboundedLoop {
    pub const RULE_ID: &'static str = "B013";

    /// Analyzes Solidity source code AST / lines for unbounded dynamic storage array loops.
    pub fn analyze(source: &str) -> Vec<DiagnosticIssue> {
        let mut diagnostics = Vec::new();

        for (line_index, line) in source.lines().enumerate() {
            let line_num = line_index + 1;
            let trimmed = line.trim();

            // Check if line is a for/while loop reading .length
            if (trimmed.starts_with("for") || trimmed.starts_with("while")) && trimmed.contains(".length") {
                // Check if loop uses pagination offset/limit or fixed bound
                let is_paginated = trimmed.contains("limit")
                    || trimmed.contains("offset")
                    || trimmed.contains("maxIter")
                    || trimmed.contains("MAX_")
                    || trimmed.contains("break;");

                if !is_paginated {
                    diagnostics.push(DiagnosticIssue {
                        rule_id: Self::RULE_ID.to_string(),
                        title: "Unbounded Dynamic Storage Array Iteration".to_string(),
                        description: format!(
                            "Line {}: Loop iterates directly over dynamic storage array length without pagination bounds or gas limits.",
                            line_num
                        ),
                        line_number: line_num,
                        severity: Severity::Medium,
                    });
                }
            }
        }

        diagnostics
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flags_unbounded_storage_loop() {
        let code = r#"
            contract BridgeVault {
                address[] public providers;
                function calculateFees() external view returns (uint256 total) {
                    for (uint256 i = 0; i < providers.length; i++) {
                        total += getFee(providers[i]);
                    }
                }
            }
        "#;

        let issues = RuleB013UnboundedLoop::analyze(code);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].rule_id, "B013");
    }

    #[test]
    fn test_passes_paginated_storage_loop() {
        let code = r#"
            contract BridgeVault {
                address[] public providers;
                function calculateFees(uint256 offset, uint256 limit) external view returns (uint256 total) {
                    uint256 end = offset + limit;
                    for (uint256 i = offset; i < end && i < providers.length; i++) {
                        total += getFee(providers[i]);
                    }
                }
            }
        "#;

        let issues = RuleB013UnboundedLoop::analyze(code);
        assert_eq!(issues.len(), 0);
    }
}
