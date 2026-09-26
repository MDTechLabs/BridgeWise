
import { getRegistry, updateRegistry } from './registry';
import { fetchLatestAssets } from './fetcher';
import { Asset } from './types';

export async function synchronize(): Promise<void> {
  console.log('Starting asset registry synchronization...');

  const currentRegistry = await getRegistry();
  const latestAssets = await fetchLatestAssets();

  const currentAssetIds = new Set(currentRegistry.assets.map((asset) => asset.id));
  const latestAssetIds = new Set(latestAssets.map((asset) => asset.id));

  const newAssets = latestAssets.filter((asset) => !currentAssetIds.has(asset.id));
  const removedAssets = currentRegistry.assets.filter((asset) => !latestAssetIds.has(asset.id));

  if (newAssets.length > 0 || removedAssets.length > 0) {
    console.log('Changes detected. Updating registry...');
    console.log('New assets:', newAssets);
    console.log('Removed assets:', removedAssets);

    await updateRegistry({ assets: latestAssets });
    console.log('Registry updated successfully.');
  } else {
    console.log('No changes detected. Registry is up to date.');
  }

  console.log('Asset registry synchronization finished.');
}