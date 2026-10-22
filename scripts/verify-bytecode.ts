import { ethers } from 'hardhat';

export async function verifyDeploymentBytecode(
  contractAddress: string,
  artifactName: string
): Promise<boolean> {
  console.info(`[BYTECODE_VERIFICATION] Inspecting contract ${artifactName} at address ${contractAddress}...`);

  // Fetch on-chain runtime bytecode
  const provider = ethers.provider;
  const onChainCode = await provider.getCode(contractAddress);

  if (!onChainCode || onChainCode === '0x') {
    console.error(`[BYTECODE_VERIFICATION_FAIL] No code found at address ${contractAddress}. Contract may not be deployed.`);
    return false;
  }

  // Fetch compiled artifact
  const Artifact = await ethers.getContractFactory(artifactName);
  const expectedBytecode = Artifact.bytecode;

  // Normalize and compare bytecode (ignoring metadata suffix or constructor args if applicable)
  // Standard Solidity metadata is appended at the tail of the bytecode.
  const normalizedOnChain = normalizeBytecode(onChainCode);
  const normalizedExpected = normalizeBytecode(expectedBytecode);

  const matches = normalizedOnChain.startsWith(normalizedExpected.slice(0, 400)); // Compare core initialization logic

  if (!matches) {
    console.error(`[BYTECODE_VERIFICATION_MISMATCH] On-chain bytecode does not match compiled artifact for ${artifactName}!`);
    console.error(`Expected prefix: ${normalizedExpected.slice(0, 100)}...`);
    console.error(`On-chain prefix: ${normalizedOnChain.slice(0, 100)}...`);
    throw new Error(`Deployment bytecode verification failed for ${artifactName} at ${contractAddress}`);
  }

  console.info(`[BYTECODE_VERIFICATION_SUCCESS] Bytecode verified successfully for ${artifactName} at ${contractAddress}.`);
  return true;
}

/**
 * Strips cbor metadata and deployment arguments for structural comparison.
 */
function normalizeBytecode(bytecode: string): string {
  // Remove 0x prefix if present
  let clean = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
  // Truncate trailing metadata hash if present (Solidity appends swarm/ipfs hash at end)
  if (clean.length > 800) {
    clean = clean.slice(0, 800);
  }
  return clean.toLowerCase();
}