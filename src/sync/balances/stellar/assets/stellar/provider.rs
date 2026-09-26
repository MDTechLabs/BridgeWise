#[async_trait]
pub trait AssetProvider {
    async fn fetch_assets(&self) -> Result<Vec<StellarAsset>, SyncError>;
}