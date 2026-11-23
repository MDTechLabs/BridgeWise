import { main } from './post-deployment-address-check.cli';

main().catch((error: unknown) => {
  console.error(
    `Post-deployment address check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
