//! Rule **B002** — Unchecked validator address assignment.
//!
//! # What it detects
//!
//! Functions that mutate a validator set / multi-sig signer set (either by name
//! — `addValidator`, `rotateSigner`, `setGuardians`, … — or by writing to a
//! validator-shaped state slot) while accepting an `address` (or `address[]`)
//! parameter that is never asserted to be non-zero.
//!
//! # Why it matters
//!
//! `ecrecover` returns `address(0)` for malformed signatures (`v = 0`, or an
//! `s` value outside the lower half-order). If `address(0)` is registered as an
//! active validator, an attacker can satisfy one slot of the signature
//! threshold with an all-zero signature, effectively lowering the quorum by one
//! for every zero entry present in the set.
//!
//! # Remediation
//!
//! ```solidity
//! require(validator != address(0), "B002: zero validator");
//! // or
//! if (validator == address(0)) revert ZeroValidator();
//! ```
//!
//! # Accepted proof-of-check forms
//!
//! * `require(v != address(0), ...)` / `assert(v != address(0))`
//! * `if (v == address(0)) revert ...;`
//! * a guarding modifier whose name mentions zero/valid-address, e.g.
//!   `nonZeroAddress(v)`
//! * an internal helper call such as `_requireNonZeroAddress(v)`
//! * per-element checks for array inputs, including through a local alias
//!   (`address candidate = validators[i]; require(candidate != address(0));`)

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Stable identifier for this rule.
pub const RULE_ID: &str = "B002";
/// Human readable slug used by the report renderer.
pub const RULE_NAME: &str = "unchecked-validator-zero-address";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

/// A single B002 violation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub rule_id: &'static str,
    pub rule_name: &'static str,
    pub file: String,
    /// 1-based line of the `function` keyword.
    pub line: usize,
    pub function: String,
    /// Address parameters that reach the validator write without a zero check.
    pub unchecked_params: Vec<String>,
    pub severity: Severity,
    pub message: String,
}

/// Run rule B002 over a single Solidity source unit.
pub fn analyze(source: &str, file_path: &str) -> Vec<Finding> {
    let clean: Vec<char> = strip_noise(source).chars().collect();
    let mut findings = Vec::new();

    for func in parse_functions(&clean) {
        let body = compact(&func.body);
        let header = compact(&func.header);

        if !mutates_validator_set(&func.name, &body) {
            continue;
        }

        let unchecked: Vec<String> = func
            .params
            .iter()
            .filter(|p| !has_zero_check(p, &header, &body))
            .map(|p| p.name.clone())
            .collect();

        if unchecked.is_empty() {
            continue;
        }

        findings.push(Finding {
            rule_id: RULE_ID,
            rule_name: RULE_NAME,
            file: file_path.to_string(),
            line: func.line,
            function: func.name.clone(),
            message: format!(
                "`{}` updates the validator/signer set using address input(s) `{}` \
                 without an explicit `address(0)` assertion. A zero entry silently \
                 lowers the signature threshold because `ecrecover` yields \
                 `address(0)` for invalid signatures.",
                func.name,
                unchecked.join("`, `")
            ),
            unchecked_params: unchecked,
            severity: Severity::High,
        });
    }

    findings
}

// ---------------------------------------------------------------------------
// Lightweight Solidity function extraction
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Param {
    name: String,
    /// `address[]` inputs are checked element-wise.
    is_array: bool,
}

#[derive(Debug, Clone)]
struct FunctionNode {
    name: String,
    /// Only `address` / `address[]` parameters are retained.
    params: Vec<Param>,
    /// Text between the parameter list and the body (visibility, modifiers…).
    header: String,
    body: String,
    line: usize,
}

fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '$'
}

/// Blanks out comments and string/char literals so their contents can never be
/// mistaken for code, while preserving line breaks for accurate line numbers.
fn strip_noise(src: &str) -> String {
    let chars: Vec<char> = src.chars().collect();
    let mut out = String::with_capacity(src.len());
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied().unwrap_or('\0');

        if c == '/' && next == '/' {
            while i < chars.len() && chars[i] != '\n' {
                out.push(' ');
                i += 1;
            }
        } else if c == '/' && next == '*' {
            out.push_str("  ");
            i += 2;
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                out.push(if chars[i] == '\n' { '\n' } else { ' ' });
                i += 1;
            }
            if i < chars.len() {
                out.push_str("  ");
                i += 2;
            }
        } else if c == '"' || c == '\'' {
            let quote = c;
            out.push(' ');
            i += 1;
            while i < chars.len() && chars[i] != quote {
                if chars[i] == '\\' {
                    out.push(' ');
                    i += 1;
                    if i < chars.len() {
                        out.push(' ');
                        i += 1;
                    }
                    continue;
                }
                out.push(if chars[i] == '\n' { '\n' } else { ' ' });
                i += 1;
            }
            if i < chars.len() {
                out.push(' ');
                i += 1;
            }
        } else {
            out.push(c);
            i += 1;
        }
    }

    out
}

/// Index of the delimiter closing the one at `open_idx`.
fn matching(chars: &[char], open_idx: usize, open: char, close: char) -> Option<usize> {
    let mut depth = 0usize;
    let mut i = open_idx;
    while i < chars.len() {
        if chars[i] == open {
            depth += 1;
        } else if chars[i] == close {
            if depth == 0 {
                return None;
            }
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

fn skip_ws(chars: &[char], mut i: usize) -> usize {
    while i < chars.len() && chars[i].is_whitespace() {
        i += 1;
    }
    i
}

fn word_at(chars: &[char], i: usize, word: &str) -> bool {
    let w: Vec<char> = word.chars().collect();
    if i + w.len() > chars.len() || chars[i..i + w.len()] != w[..] {
        return false;
    }
    let before_ok = i == 0 || !is_ident_char(chars[i - 1]);
    let after_ok = i + w.len() >= chars.len() || !is_ident_char(chars[i + w.len()]);
    before_ok && after_ok
}

fn parse_functions(clean: &[char]) -> Vec<FunctionNode> {
    let mut out = Vec::new();
    let mut i = 0;

    while i < clean.len() {
        if !word_at(clean, i, "function") {
            i += 1;
            continue;
        }
        let kw_start = i;

        let mut j = skip_ws(clean, i + "function".len());
        let name_start = j;
        while j < clean.len() && is_ident_char(clean[j]) {
            j += 1;
        }
        let name: String = clean[name_start..j].iter().collect();
        j = skip_ws(clean, j);

        if name.is_empty() || j >= clean.len() || clean[j] != '(' {
            i = kw_start + 1;
            continue;
        }

        let params_close = match matching(clean, j, '(', ')') {
            Some(k) => k,
            None => break,
        };
        let params_txt: String = clean[j + 1..params_close].iter().collect();

        // Walk the header (visibility / mutability / modifiers / returns) until
        // the body opens, bailing out on `;` for interface & abstract stubs.
        let header_start = params_close + 1;
        let mut k = header_start;
        let mut depth = 0i32;
        let mut body_open = None;
        while k < clean.len() {
            match clean[k] {
                '(' => depth += 1,
                ')' => depth -= 1,
                '{' if depth == 0 => {
                    body_open = Some(k);
                    break;
                }
                ';' if depth == 0 => break,
                _ => {}
            }
            k += 1;
        }

        let body_open = match body_open {
            Some(b) => b,
            None => {
                i = params_close + 1;
                continue;
            }
        };
        let body_close = match matching(clean, body_open, '{', '}') {
            Some(c) => c,
            None => break,
        };

        let params = parse_address_params(&params_txt);
        if !params.is_empty() {
            out.push(FunctionNode {
                name,
                params,
                header: clean[header_start..body_open].iter().collect(),
                body: clean[body_open + 1..body_close].iter().collect(),
                line: clean[..kw_start].iter().filter(|c| **c == '\n').count() + 1,
            });
        }

        i = body_close + 1;
    }

    out
}

/// Splits a parameter list on top-level commas and keeps only address inputs.
fn parse_address_params(text: &str) -> Vec<Param> {
    let mut params = Vec::new();
    let mut depth = 0i32;
    let mut current = String::new();

    let push_current = |raw: &str, params: &mut Vec<Param>| {
        let raw = raw.trim();
        if raw.is_empty() {
            return;
        }
        let tokens: Vec<&str> = raw.split_whitespace().collect();
        let ty = tokens[0];
        if !ty.starts_with("address") {
            return;
        }
        let name = match tokens.last() {
            // `function f(address)` — unnamed, nothing to reason about.
            Some(n) if tokens.len() > 1 => n.trim_matches(|c: char| !is_ident_char(c)),
            _ => return,
        };
        if name.is_empty() {
            return;
        }
        params.push(Param {
            name: name.to_string(),
            is_array: raw.contains('['),
        });
    };

    for c in text.chars() {
        match c {
            '(' | '[' => {
                depth += 1;
                current.push(c);
            }
            ')' | ']' => {
                depth -= 1;
                current.push(c);
            }
            ',' if depth == 0 => {
                push_current(&current, &mut params);
                current.clear();
            }
            _ => current.push(c),
        }
    }
    push_current(&current, &mut params);

    params
}

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

/// Identifier fragments that mark a validator / multi-sig membership slot.
const VALIDATOR_HINTS: &[&str] = &[
    "validator",
    "signer",
    "guardian",
    "attestor",
    "attester",
    "multisig",
    "quorum",
    "committee",
    "relayer",
];

/// True when the function is a validator-set / signer-set mutation routine,
/// either by naming convention or by writing to a validator-shaped slot.
fn mutates_validator_set(name: &str, compact_body: &str) -> bool {
    let lower_name = name.to_ascii_lowercase();
    if VALIDATOR_HINTS.iter().any(|h| lower_name.contains(h)) {
        return true;
    }

    let chars: Vec<char> = compact_body.to_ascii_lowercase().chars().collect();

    for hint in VALIDATOR_HINTS {
        let mut from = 0;
        while let Some(start) = find_from(&chars, hint, from) {
            // Expand to the full identifier containing the hint.
            let mut end = start + hint.len();
            while end < chars.len() && is_ident_char(chars[end]) {
                end += 1;
            }
            from = start + hint.len();

            // `validators[x] = ...`
            let after = if end < chars.len() && chars[end] == '[' {
                match matching(&chars, end, '[', ']') {
                    Some(close) => close + 1,
                    None => continue,
                }
            } else {
                end
            };

            if after >= chars.len() {
                continue;
            }
            let tail: String = chars[after..].iter().collect();
            let is_write = (tail.starts_with('=') && !tail.starts_with("=="))
                || tail.starts_with(".push(")
                || tail.starts_with(".pop(")
                || tail.starts_with(".add(")
                || tail.starts_with(".remove(")
                || tail.starts_with(".set(");
            if is_write {
                return true;
            }
        }
    }

    false
}

fn compact(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

/// Char-index substring search (byte offsets are unsafe for slicing here).
fn find_from(chars: &[char], needle: &str, from: usize) -> Option<usize> {
    let n: Vec<char> = needle.chars().collect();
    if n.is_empty() || n.len() > chars.len() {
        return None;
    }
    (from..=chars.len() - n.len()).find(|&i| chars[i..i + n.len()] == n[..])
}

fn mentions_zero_address(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    l.contains("address(0)")
        || l.contains("address(0x0)")
        || l.contains("address(uint160(0))")
        || l.contains("0x0000000000000000000000000000000000000000")
}

/// Whole-identifier occurrence test over whitespace-stripped source.
fn references(haystack: &str, name: &str) -> bool {
    let h: Vec<char> = haystack.chars().collect();
    let n: Vec<char> = name.chars().collect();
    if n.is_empty() || n.len() > h.len() {
        return false;
    }
    (0..=h.len() - n.len()).any(|i| word_at(&h, i, name))
}

struct Guard {
    /// Condition text, whitespace-stripped.
    cond: String,
    /// Whether the guard aborts on failure (`require`/`assert`, or an `if`
    /// whose branch reverts).
    aborts: bool,
}

/// Extracts `require(...)`, `assert(...)` and `if (...)` guards from a body.
fn guards(compact_body: &str) -> Vec<Guard> {
    let chars: Vec<char> = compact_body.chars().collect();
    let mut out = Vec::new();

    for (kw, is_if) in [("require", false), ("assert", false), ("if", true)] {
        let mut i = 0;
        while i < chars.len() {
            if !word_at(&chars, i, kw) {
                i += 1;
                continue;
            }
            let open = i + kw.len();
            if open >= chars.len() || chars[open] != '(' {
                i += 1;
                continue;
            }
            let close = match matching(&chars, open, '(', ')') {
                Some(c) => c,
                None => break,
            };

            let aborts = if is_if {
                let tail_end = (close + 200).min(chars.len());
                let tail: String = chars[close + 1..tail_end].iter().collect();
                let tail = tail.to_ascii_lowercase();
                tail.contains("revert") || tail.contains("require(") || tail.contains("throw")
            } else {
                true
            };

            out.push(Guard {
                cond: chars[open + 1..close].iter().collect(),
                aborts,
            });
            i = close + 1;
        }
    }

    out
}

/// Locals initialised from `param`, e.g. `address candidate = validators[i];`.
fn aliases_of(compact_body: &str, param: &str) -> Vec<String> {
    let chars: Vec<char> = compact_body.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        if !word_at(&chars, i, "address") {
            i += 1;
            continue;
        }
        let mut j = i + "address".len();
        let name_start = j;
        while j < chars.len() && is_ident_char(chars[j]) {
            j += 1;
        }
        if j == name_start || j >= chars.len() || chars[j] != '=' {
            i += 1;
            continue;
        }
        let mut k = j + 1;
        while k < chars.len() && chars[k] != ';' {
            k += 1;
        }
        let expr: String = chars[j + 1..k.min(chars.len())].iter().collect();
        if references(&expr, param) {
            out.push(chars[name_start..j].iter().collect());
        }
        i = k;
    }

    out
}

/// `_requireNonZeroAddress(v)` / `nonZeroAddress(v)` style checks — an
/// identifier mentioning "zero"/"validaddress" applied directly to `name`.
fn has_zero_helper_call(compact_text: &str, name: &str) -> bool {
    let chars: Vec<char> = compact_text.chars().collect();
    let needle: Vec<char> = format!("({})", name).chars().collect();
    if needle.len() > chars.len() {
        return false;
    }

    for i in 0..=chars.len() - needle.len() {
        if chars[i..i + needle.len()] != needle[..] {
            continue;
        }
        let mut start = i;
        while start > 0 && is_ident_char(chars[start - 1]) {
            start -= 1;
        }
        let callee: String = chars[start..i].iter().collect::<String>().to_ascii_lowercase();
        if callee.contains("zero") || callee.contains("validaddress") {
            return true;
        }
    }

    false
}

/// True when `param` is provably asserted non-zero before use.
fn has_zero_check(param: &Param, compact_header: &str, compact_body: &str) -> bool {
    let mut names = vec![param.name.clone()];
    if param.is_array {
        // `address candidate = validators[i]; require(candidate != address(0));`
        names.extend(aliases_of(compact_body, &param.name));
    }

    for name in &names {
        // Guarding modifier on the signature, e.g. `nonZeroAddress(validator)`.
        if has_zero_helper_call(compact_header, name) {
            return true;
        }
        // Internal helper inside the body.
        if has_zero_helper_call(compact_body, name) {
            return true;
        }
    }

    guards(compact_body).into_iter().any(|g| {
        g.aborts && mentions_zero_address(&g.cond) && names.iter().any(|n| references(&g.cond, n))
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLES: &str = include_str!("../test/fixtures/b002_samples.sol");

    fn flagged(src: &str) -> Vec<String> {
        analyze(src, "b002_samples.sol")
            .into_iter()
            .map(|f| f.function)
            .collect()
    }

    #[test]
    fn flags_validator_updates_missing_zero_assertions() {
        let names = flagged(SAMPLES);
        for expected in [
            "addValidator",
            "setValidators",
            "rotateSigner",
            "addValidatorWithWeight",
            "_setValidator",
        ] {
            assert!(
                names.iter().any(|n| n == expected),
                "expected B002 to flag `{expected}`; flagged: {names:?}"
            );
        }
    }

    #[test]
    fn passes_on_functions_with_valid_input_assertions() {
        let names = flagged(SAMPLES);
        for safe in [
            "addValidatorGuarded",
            "setValidatorsGuarded",
            "replaceSignerGuarded",
            "registerGuardian",
            "addSignerBatch",
            "setFeeRecipient",
        ] {
            assert!(
                !names.iter().any(|n| n == safe),
                "B002 false positive on `{safe}`; flagged: {names:?}"
            );
        }
    }

    #[test]
    fn reports_every_unchecked_parameter() {
        let finding = analyze(SAMPLES, "b002_samples.sol")
            .into_iter()
            .find(|f| f.function == "rotateSigner")
            .expect("rotateSigner should be flagged");
        assert_eq!(finding.unchecked_params, vec!["oldSigner", "newSigner"]);
        assert_eq!(finding.severity, Severity::High);
        assert_eq!(finding.rule_id, "B002");
    }

    #[test]
    fn ignores_non_validator_routines() {
        let src = r#"
            contract C {
                address public treasury;
                function setTreasury(address t) external { treasury = t; }
            }
        "#;
        assert!(flagged(src).is_empty());
    }

    #[test]
    fn detects_validator_write_without_naming_hint_in_function() {
        let src = r#"
            contract C {
                mapping(address => bool) public isValidator;
                function grant(address account) external { isValidator[account] = true; }
            }
        "#;
        assert_eq!(flagged(src), vec!["grant".to_string()]);
    }

    #[test]
    fn accepts_custom_error_revert_guard() {
        let src = r#"
            contract C {
                error ZeroValidator();
                mapping(address => bool) public isValidator;
                function addValidator(address v) external {
                    if (v == address(0)) revert ZeroValidator();
                    isValidator[v] = true;
                }
            }
        "#;
        assert!(flagged(src).is_empty());
    }

    #[test]
    fn comment_claiming_a_check_is_not_a_check() {
        let src = r#"
            contract C {
                mapping(address => bool) public isValidator;
                function addValidator(address v) external {
                    // require(v != address(0), "zero");
                    isValidator[v] = true;
                }
            }
        "#;
        assert_eq!(flagged(src), vec!["addValidator".to_string()]);
    }
}
