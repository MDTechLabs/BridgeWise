//! CLI entrypoint: run rule B001 against a Solidity file passed as the
//! first argument.
//!
//! Usage: `rules <path-to-file.sol>`

use std::env;
use std::fs;
use std::process::ExitCode;

use rules::b001_chain_id_check::check_source;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    let program = args.first().map(String::as_str).unwrap_or("rules");

    let Some(path) = args.get(1) else {
        eprintln!("Usage: {program} <path-to-.sol-file>");
        return ExitCode::FAILURE;
    };

    let source = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to read {path}: {e}");
            return ExitCode::FAILURE;
        }
    };

    match check_source(&source) {
        Ok(violations) if violations.is_empty() => {
            println!("B001: no violations found in {path}");
            ExitCode::SUCCESS
        }
        Ok(violations) => {
            println!("B001: {} violation(s) found in {path}:", violations.len());
            for v in &violations {
                println!("  {path}:{} [{}] {}", v.line, v.function_name, v.message);
            }
            ExitCode::FAILURE
        }
        Err(e) => {
            eprintln!("Failed to parse {path}: {e}");
            ExitCode::FAILURE
        }
    }
}
