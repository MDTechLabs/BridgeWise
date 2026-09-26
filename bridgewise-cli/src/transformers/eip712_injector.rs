//! EIP-712 domain separator injector for Solidity signature verifiers.

use solang_parser::parse;
use solang_parser::pt::{ContractPart, FunctionDefinition, SourceUnitPart};

const DOMAIN_BLOCK: &str = r#"bytes32 DOMAIN_SEPARATOR = keccak256(
    abi.encode(
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256(bytes("BridgeWise")),
        keccak256(bytes("1")),
        block.chainid,
        address(this)
    )
);
"#;

/// Inject an EIP-712 domain separator into signature-verifying functions and
/// bind their recovered hash to that domain. The source is parsed before any
/// rewrite so malformed Solidity is returned as an error rather than altered.
pub fn inject_domain_separator(source: &str) -> Result<String, String> {
    let (tree, _) = parse(source, 0)
        .map_err(|diagnostics| format!("failed to parse Solidity source: {diagnostics:?}"))?;
    let function_names = verifier_names(&tree.0);
    if function_names.is_empty() {
        return Ok(source.to_string());
    }

    let mut output = source.to_string();
    let mut functions = find_functions(source, &function_names);
    functions.sort_by(|left, right| right.body_start.cmp(&left.body_start));
    for function in functions {
        let body = &output[function.body_start..function.body_end];
        if body.contains("DOMAIN_SEPARATOR") || body.contains("hex\"1901\"") {
            continue;
        }
        let Some(updated_body) = wrap_recovered_hash(body) else {
            continue;
        };
        let injected = format!("\n{}{}", indent_block(DOMAIN_BLOCK), updated_body);
        output.replace_range(function.body_start..function.body_end, &injected);
    }
    Ok(output)
}

fn verifier_names(parts: &[SourceUnitPart]) -> Vec<String> {
    let mut names = Vec::new();
    for part in parts {
        match part {
            SourceUnitPart::ContractDefinition(contract) => {
                for part in &contract.parts {
                    if let ContractPart::FunctionDefinition(function) = part {
                        if is_verifier(function) {
                            if let Some(name) = &function.name { names.push(name.name.clone()); }
                        }
                    }
                }
            }
            SourceUnitPart::FunctionDefinition(function) if is_verifier(function) => {
                if let Some(name) = &function.name { names.push(name.name.clone()); }
            }
            _ => {}
        }
    }
    names
}

fn is_verifier(function: &FunctionDefinition) -> bool {
    let name = function.name.as_ref().map(|identifier| identifier.name.to_ascii_lowercase()).unwrap_or_default();
    name.contains("verify") || name.contains("signature")
}

struct FunctionSpan { body_start: usize, body_end: usize }

fn find_functions(source: &str, names: &[String]) -> Vec<FunctionSpan> {
    let mut spans = Vec::new();
    let mut cursor = 0;
    while let Some(function_offset) = source[cursor..].find("function") {
        let start = cursor + function_offset;
        let Some(open_offset) = source[start..].find('{') else { break };
        let open = start + open_offset;
        let signature = &source[start..open];
        if !names.iter().any(|name| signature.contains(&format!("function {name}"))) {
            cursor = open + 1;
            continue;
        }
        let mut depth = 1;
        let mut end = open + 1;
        while depth > 0 && end < source.len() {
            match source.as_bytes()[end] {
                b'{' => depth += 1,
                b'}' => depth -= 1,
                _ => {}
            }
            end += 1;
        }
        if depth == 0 { spans.push(FunctionSpan { body_start: open + 1, body_end: end - 1 }); }
        cursor = end;
    }
    spans
}

fn wrap_recovered_hash(body: &str) -> Option<String> {
    let mut result = body.to_string();
    for call in ["ecrecover(", "ECDSA.recover("] {
        let Some(call_start) = result.find(call) else { continue };
        let argument_start = call_start + call.len();
        let remainder = &result[argument_start..];
        let comma = remainder.find(',')?;
        let hash = remainder[..comma].trim();
        if hash.is_empty() || hash.contains('(') { return None; }
        let replacement = format!("keccak256(abi.encodePacked(hex\"1901\", DOMAIN_SEPARATOR, {hash}))");
        let hash_start = argument_start + remainder.find(hash)?;
        result.replace_range(hash_start..hash_start + hash.len(), &replacement);
        return Some(result);
    }
    None
}

fn indent_block(block: &str) -> String {
    block.lines().map(|line| format!("    {line}\n")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn injects_domain_and_wraps_raw_recovery_hash() {
        let source = r#"pragma solidity ^0.8.19;
contract Sample {
    function verify(bytes32 messageHash, uint8 v, bytes32 r, bytes32 s) external returns (bool) {
        return ecrecover(messageHash, v, r, s) != address(0);
    }
}"#;
        let transformed = inject_domain_separator(source).unwrap();
        assert!(transformed.contains("bytes32 DOMAIN_SEPARATOR"));
        assert!(transformed.contains("hex\"1901\""));
        assert!(transformed.contains("DOMAIN_SEPARATOR, messageHash"));
    }

    #[test]
    fn leaves_already_domain_bound_verifiers_unchanged() {
        let source = r#"contract Sample { function verify(bytes32 messageHash) external returns (bool) { bytes32 DOMAIN_SEPARATOR = bytes32(0); return ecrecover(keccak256(abi.encodePacked(hex"1901", DOMAIN_SEPARATOR, messageHash)), 27, bytes32(0), bytes32(0)) != address(0); } }"#;
        assert_eq!(inject_domain_separator(source).unwrap(), source);
    }
}