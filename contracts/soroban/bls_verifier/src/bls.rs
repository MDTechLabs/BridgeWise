use soroban_sdk::{Env, Bytes, BytesN, panic_with_error};
use crate::errors::Error;

/// BLS signature verification parameters
pub struct BLSSignature {
    pub aggregated_public_key: BytesN<48>,  // BLS12-381 G1 public key
    pub aggregated_signature: BytesN<96>,   // BLS12-381 G2 signature
    pub message_hash: BytesN<32>,           // Message to verify
}

/// Bitmask utilities for validator set verification
pub struct BitmaskVerifier;

impl BitmaskVerifier {
    /// Count set bits in a bitmask to verify quorum threshold
    pub fn count_signers(bitmask: &Bytes) -> u32 {
        let mut count = 0;
        for byte in bitmask.iter() {
            count += byte.count_ones();
        }
        count
    }

    /// Verify that the number of signers meets or exceeds the quorum threshold
    pub fn verify_quorum(bitmask: &Bytes, total_validators: u32, threshold_percent: u32) -> Result<(), Error> {
        let signers = Self::count_signers(bitmask);
        let required = (total_validators * threshold_percent + 99) / 100; // Ceiling division
        
        if signers < required {
            return Err(Error::InsufficientQuorum);
        }
        
        Ok(())
    }

    /// Verify that all bits set in the bitmask correspond to active validators
    pub fn verify_active_validators(bitmask: &Bytes, active_validators_bitmask: &Bytes) -> Result<(), Error> {
        if bitmask.len() != active_validators_bitmask.len() {
            return Err(Error::InvalidBitmaskLength);
        }

        for (bit, active_bit) in bitmask.iter().zip(active_validators_bitmask.iter()) {
            // Check that all set bits in the signature bitmask are also set in the active validators bitmask
            if (bit & !active_bit) != 0 {
                return Err(Error::InactiveValidatorIncluded);
            }
        }

        Ok(())
    }
}

/// BLS verifier that utilizes Soroban's host environment cryptographic functions
pub struct BLSVerifier;

impl BLSVerifier {
    /// Verify a BLS signature using the host environment's pairing-friendly cryptographic functions
    pub fn verify(env: &Env, params: &BLSSignature) -> Result<(), Error> {
        // Use Soroban's host crypto functions for pairing verification
        // The env.crypto() interface provides access to native cryptographic primitives
        let verified = env.crypto().bls12_381_verify(
            &params.aggregated_public_key,
            &params.aggregated_signature,
            &params.message_hash
        );

        if !verified {
            return Err(Error::InvalidSignature);
        }

        Ok(())
    }

    /// Convenience function to verify both quorum and signature
    pub fn verify_all(
        env: &Env,
        signature_params: BLSSignature,
        signature_bitmask: Bytes,
        active_validators_bitmask: Bytes,
        total_validators: u32,
        threshold_percent: u32
    ) -> Result<(), Error> {
        // First verify quorum requirements
        BitmaskVerifier::verify_quorum(&signature_bitmask, total_validators, threshold_percent)?;
        
        // Verify all included validators are active
        BitmaskVerifier::verify_active_validators(&signature_bitmask, &active_validators_bitmask)?;
        
        // Verify the BLS signature itself
        Self::verify(env, &signature_params)?;

        Ok(())
    }
}