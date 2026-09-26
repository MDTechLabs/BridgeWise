import {
  SorobanContractResolver,
} from './soroban-contract-resolver.service';
import type { ContractEntry, ResolveOptions, ResolveResult } from './soroban-contract-resolver.types';
import { StellarNetwork } from '../../../config/networks/stellar-networks';

export interface TokenContractRegistration {
  assetCode: string;
  network: StellarNetwork;
  address: string;
  description?: string;
}

export class SorobanTokenContractResolver {
  constructor(private readonly resolver = new SorobanContractResolver()) {}

  registerTokenContract(entry: TokenContractRegistration): ContractEntry {
    const contractName = `token:${entry.assetCode.toLowerCase().trim()}`;
    this.resolver.register({
      contractName,
      network: entry.network,
      address: entry.address,
      description: entry.description ?? `Token contract for ${entry.assetCode}`,
    });

    return this.resolver.getEntry(contractName, entry.network)!;
  }

  resolveTokenContract(
    assetCode: string,
    network: StellarNetwork,
    options: ResolveOptions = {},
  ): ResolveResult {
    return this.resolver.resolve(`token:${assetCode.toLowerCase().trim()}`, network, options);
  }
}

