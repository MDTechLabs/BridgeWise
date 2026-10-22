import { task } from 'hardhat/config';
import { verifyDeploymentBytecode } from '../scripts/verify-bytecode';

task('verify:bytecode', 'Verifies on-chain deployed contract bytecode against local compilation artifacts')
  .addParam('address', 'The deployed contract address')
  .addParam('contract', 'The contract artifact name')
  .setAction(async (taskArgs, hre) => {
    try {
      const isValid = await verifyDeploymentBytecode(taskArgs.address, taskArgs.contract);
      if (!isValid) {
        process.exit(1);
      }
    } catch (error) {
      console.error('[TASK_ERROR]', error);
      process.exit(1);
    }
  });