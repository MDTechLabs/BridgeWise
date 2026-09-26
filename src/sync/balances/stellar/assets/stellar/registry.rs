pub struct AssetRegistry;

impl AssetRegistry {
    pub async fn get_all(&self) -> Vec<StellarAsset>;

    pub async fn save_all(
        &self,
        assets: Vec<StellarAsset>,
    ) -> Result<(), SyncError>;
}