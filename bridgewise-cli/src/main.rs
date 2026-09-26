use std::{env, fs, process::ExitCode};

use bridgewise_cli::transformers::eip712_injector::inject_domain_separator;

fn main() -> ExitCode {
    let Some(path) = env::args().nth(1) else {
        eprintln!("Usage: bridgewise-cli <path-to-.sol-file>");
        return ExitCode::FAILURE;
    };
    let source = match fs::read_to_string(&path) {
        Ok(source) => source,
        Err(error) => { eprintln!("Failed to read {path}: {error}"); return ExitCode::FAILURE; }
    };
    match inject_domain_separator(&source) {
        Ok(transformed) => { print!("{transformed}"); ExitCode::SUCCESS }
        Err(error) => { eprintln!("Failed to transform {path}: {error}"); ExitCode::FAILURE }
    }
}