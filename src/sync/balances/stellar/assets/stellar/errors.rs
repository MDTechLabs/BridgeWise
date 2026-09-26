#[derive(Debug)]
pub enum SyncError {
    ProviderError(String),
    RegistryError(String),
}