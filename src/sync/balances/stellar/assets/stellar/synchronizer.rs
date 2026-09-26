pub struct AssetSynchronizer {
    providers: Vec<Box<dyn AssetProvider>>,
    registry: AssetRegistry,
}