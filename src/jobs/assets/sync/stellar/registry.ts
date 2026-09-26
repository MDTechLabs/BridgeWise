
import { Registry } from './types';

// Mock implementation of a registry
let registry: Registry = { assets: [] };

export async function getRegistry(): Promise<Registry> {
  return Promise.resolve(registry);
}

export async function updateRegistry(updatedRegistry: Registry): Promise<void> {
  registry = updatedRegistry;
  return Promise.resolve();
}