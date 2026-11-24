import { expect } from 'chai';
import hre from 'hardhat';

const CHAIN_A = 1;
const CHAIN_B = 137;
const CHAIN_DISABLED = 999;
const TRANSFER_SELECTOR = '0xa9059cbb';
const APPROVE_SELECTOR = '0x095ea7b3';

function chainConfig(enabled: boolean, confirmations = 2, maxAge = 600) {
  return {
    enabled,
    requiredConfirmations: confirmations,
    maxSimulationAge: maxAge,
  };
}

describe('SignerPolicy — destination and method allowlists', () => {
  let ethers: any;
  let networkHelpers: any;

  before(async () => {
    const connection = await hre.network.create();
    ethers = connection.ethers;
    networkHelpers = connection.networkHelpers;
    await networkHelpers.mine(8);
  });

  function id(n: number): string {
    return ethers.zeroPadValue(ethers.toBeHex(n), 32);
  }

  async function deploy() {
    const [admin, executor, signer, other, recipient] =
      await ethers.getSigners();
    const Factory = await ethers.getContractFactory('SignerPolicy');
    const policy = await Factory.deploy(
      admin.address,
      [CHAIN_A, CHAIN_B, CHAIN_DISABLED],
      [chainConfig(true), chainConfig(true, 1, 120), chainConfig(false)],
    );
    await policy.waitForDeployment();
    await policy.connect(admin).setExecutor(executor.address, true);
    await policy.connect(admin).setSigner(signer.address, true);
    return { policy, Factory, admin, executor, signer, other, recipient };
  }

  type RecordArgs = {
    operationId: string;
    signer: any;
    chainId?: number;
    destination?: string;
    selector?: string;
    payloadHash?: string;
    observedBlock?: number;
    observedAt?: number;
    confirmations?: number;
  };

  async function record(policy: any, admin: any, args: RecordArgs) {
    const chainId = args.chainId ?? CHAIN_A;
    const currentBlock = await ethers.provider.getBlockNumber();
    const latest = await ethers.provider.getBlock('latest');
    const required = Number(
      (await policy.chainConfig(chainId)).requiredConfirmations,
    );
    const defaults = {
      destination: args.signer.address,
      selector: TRANSFER_SELECTOR,
      payloadHash: id(900),
    };
    const destination = args.destination ?? defaults.destination;
    const selector = args.selector ?? defaults.selector;
    const payloadHash = args.payloadHash ?? defaults.payloadHash;
    await policy
      .connect(admin)
      .recordSimulation(
        args.operationId,
        args.signer.address,
        chainId,
        destination,
        selector,
        payloadHash,
        args.observedBlock ?? currentBlock - required,
        args.observedAt ?? latest.timestamp,
        args.confirmations ?? required,
      );
    return { chainId, destination, selector, payloadHash };
  }

  async function authorize(policy: any, executor: any, args: RecordArgs) {
    const chainId = args.chainId ?? CHAIN_A;
    return policy
      .connect(executor)
      .authorizeAndConsume(
        args.operationId,
        args.signer.address,
        chainId,
        args.destination ?? args.signer.address,
        args.selector ?? TRANSFER_SELECTOR,
        args.payloadHash ?? id(900),
      );
  }

  async function fullSetup(fixture: any, operationId = id(1)) {
    const { policy, admin, executor, signer, recipient } = fixture;
    await policy
      .connect(admin)
      .allowDestination(signer.address, CHAIN_A, recipient.address);
    await policy.connect(admin).allowMethod(signer.address, TRANSFER_SELECTOR);
    await record(policy, admin, {
      operationId,
      signer,
      destination: recipient.address,
      selector: TRANSFER_SELECTOR,
    });
    return { policy, admin, executor, signer, recipient };
  }

  describe('deployment and chain-specific parameters', () => {
    it('rejects a zero admin, mismatched arrays, too many chains, and invalid configs', async () => {
      const Factory = await ethers.getContractFactory('SignerPolicy');
      const [, , signer] = await ethers.getSigners();

      await expect(
        Factory.deploy(ethers.ZeroAddress, [CHAIN_A], [chainConfig(true)]),
      ).to.be.revertedWithCustomError(Factory, 'ZeroAddress');
      await expect(
        Factory.deploy(signer.address, [CHAIN_A, CHAIN_B], [chainConfig(true)]),
      ).to.be.revertedWithCustomError(Factory, 'LengthMismatch');

      const manyChains = Array.from({ length: 33 }, (_, i) => i + 1);
      await expect(
        Factory.deploy(
          signer.address,
          manyChains,
          manyChains.map(() => chainConfig(true)),
        ),
      ).to.be.revertedWithCustomError(Factory, 'TooManyChains');

      for (const invalid of [
        chainConfig(true, 0, 600),
        chainConfig(true, 65, 600),
        chainConfig(true, 2, 4),
        chainConfig(true, 2, 8 * 24 * 60 * 60),
      ]) {
        await expect(
          Factory.deploy(signer.address, [CHAIN_A], [invalid]),
        ).to.be.revertedWithCustomError(Factory, 'InvalidChainConfig');
      }
    });

    it('stores explicit per-chain confirmations and freshness bounds', async () => {
      const { policy } = await deploy();
      expect(
        (await policy.chainConfig(CHAIN_A)).requiredConfirmations,
      ).to.equal(2n);
      expect((await policy.chainConfig(CHAIN_B)).maxSimulationAge).to.equal(
        120n,
      );
      expect((await policy.chainConfig(CHAIN_DISABLED)).enabled).to.equal(
        false,
      );
    });

    it('only lets the admin change chain config or admin', async () => {
      const { policy, admin, other } = await deploy();
      await expect(
        policy.connect(other).setChainConfig(CHAIN_A, chainConfig(false)),
      ).to.be.revertedWithCustomError(policy, 'UnauthorizedAdmin');
      await expect(
        policy.connect(other).setAdmin(other.address),
      ).to.be.revertedWithCustomError(policy, 'UnauthorizedAdmin');
      await expect(
        policy.connect(admin).setAdmin(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(policy, 'ZeroAddress');
      await expect(policy.connect(admin).setAdmin(other.address))
        .to.emit(policy, 'AdminChanged')
        .withArgs(admin.address, other.address);
      expect(await policy.admin()).to.equal(other.address);
    });
  });

  describe('signer and executor authorization boundary', () => {
    it('allows only the admin to manage signers and executors', async () => {
      const { policy, admin, executor, other } = await deploy();
      expect(await policy.isExecutor(executor.address)).to.equal(true);
      expect(await policy.isSigner(other.address)).to.equal(false);

      await expect(
        policy.connect(other).setSigner(other.address, true),
      ).to.be.revertedWithCustomError(policy, 'UnauthorizedAdmin');
      await expect(
        policy.connect(other).setExecutor(other.address, true),
      ).to.be.revertedWithCustomError(policy, 'UnauthorizedAdmin');
      await expect(
        policy.connect(admin).setSigner(ethers.ZeroAddress, true),
      ).to.be.revertedWithCustomError(policy, 'ZeroAddress');
      await expect(
        policy.connect(admin).setExecutor(ethers.ZeroAddress, true),
      ).to.be.revertedWithCustomError(policy, 'ZeroAddress');

      await expect(policy.connect(admin).setSigner(other.address, true))
        .to.emit(policy, 'SignerUpdated')
        .withArgs(other.address, true);
      await expect(policy.connect(admin).setExecutor(other.address, true))
        .to.emit(policy, 'ExecutorUpdated')
        .withArgs(other.address, true);
    });

    it('treats repeated grants and revocations as no-ops', async () => {
      const { policy, admin, executor, signer } = await deploy();
      const firstGrant = await (
        await policy.connect(admin).setSigner(signer.address, true)
      ).wait();
      expect(firstGrant?.logs.length).to.equal(0);
      const firstExecutorGrant = await (
        await policy.connect(admin).setExecutor(executor.address, true)
      ).wait();
      expect(firstExecutorGrant?.logs.length).to.equal(0);

      await policy.connect(admin).setSigner(signer.address, false);
      expect(await policy.isSigner(signer.address)).to.equal(false);
    });
  });

  describe('destination allowlist', () => {
    it('supports valid adds, idempotent adds, revocation, and accounting', async () => {
      const { policy, admin, signer, recipient } = await deploy();
      await expect(
        policy
          .connect(admin)
          .allowDestination(signer.address, CHAIN_A, recipient.address),
      )
        .to.emit(policy, 'DestinationUpdated')
        .withArgs(signer.address, CHAIN_A, recipient.address, true);
      expect(
        await policy.allowedDestination(
          signer.address,
          CHAIN_A,
          recipient.address,
        ),
      ).to.equal(true);
      expect(await policy.destinationCount(signer.address)).to.equal(1n);

      const duplicate = await (
        await policy
          .connect(admin)
          .allowDestination(signer.address, CHAIN_A, recipient.address)
      ).wait();
      expect(duplicate?.logs.length).to.equal(0);
      expect(await policy.destinationCount(signer.address)).to.equal(1n);

      await expect(
        policy
          .connect(admin)
          .revokeDestination(signer.address, CHAIN_A, recipient.address),
      )
        .to.emit(policy, 'DestinationUpdated')
        .withArgs(signer.address, CHAIN_A, recipient.address, false);
      expect(await policy.destinationCount(signer.address)).to.equal(0n);
      const duplicateRevoke = await (
        await policy
          .connect(admin)
          .revokeDestination(signer.address, CHAIN_A, recipient.address)
      ).wait();
      expect(duplicateRevoke?.logs.length).to.equal(0);
    });

    it('rejects invalid destinations and unauthorized administrators', async () => {
      const { policy, admin, signer, other, recipient } = await deploy();
      await expect(
        policy
          .connect(admin)
          .allowDestination(other.address, CHAIN_A, recipient.address),
      ).to.be.revertedWithCustomError(policy, 'UnknownSigner');
      await expect(
        policy
          .connect(admin)
          .allowDestination(signer.address, CHAIN_DISABLED, recipient.address),
      ).to.be.revertedWithCustomError(policy, 'ChainDisabled');
      await expect(
        policy
          .connect(admin)
          .allowDestination(signer.address, CHAIN_A, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(policy, 'ZeroAddress');
      await expect(
        policy
          .connect(other)
          .allowDestination(signer.address, CHAIN_A, recipient.address),
      ).to.be.revertedWithCustomError(policy, 'UnauthorizedAdmin');
    });

    it('enforces the bounded per-signer destination limit', async () => {
      const { policy, admin, signer } = await deploy();
      const max = Number(await policy.MAX_ENTRIES_PER_SIGNER());
      for (let i = 0; i < max; i++) {
        await policy
          .connect(admin)
          .allowDestination(
            signer.address,
            CHAIN_A,
            ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(i + 1), 20)),
          );
      }
      expect(await policy.destinationCount(signer.address)).to.equal(
        BigInt(max),
      );
      await expect(
        policy
          .connect(admin)
          .allowDestination(
            signer.address,
            CHAIN_A,
            ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(max + 1), 20)),
          ),
      ).to.be.revertedWithCustomError(policy, 'LimitReached');

      const last = ethers.getAddress(
        ethers.zeroPadValue(ethers.toBeHex(max), 20),
      );
      await policy
        .connect(admin)
        .revokeDestination(signer.address, CHAIN_A, last);
      expect(await policy.destinationCount(signer.address)).to.equal(
        BigInt(max - 1),
      );
      await expect(
        policy
          .connect(admin)
          .allowDestination(
            signer.address,
            CHAIN_A,
            ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(max + 1), 20)),
          ),
      ).to.not.be.revert(ethers);
    });
  });

  describe('method allowlist', () => {
    it('supports valid adds, revocation, and rejects zero selectors', async () => {
      const { policy, admin, signer, other } = await deploy();
      await expect(
        policy.connect(admin).allowMethod(signer.address, TRANSFER_SELECTOR),
      )
        .to.emit(policy, 'MethodUpdated')
        .withArgs(signer.address, TRANSFER_SELECTOR, true);
      expect(
        await policy.allowedMethod(signer.address, TRANSFER_SELECTOR),
      ).to.equal(true);
      expect(await policy.methodCount(signer.address)).to.equal(1n);

      await expect(
        policy.connect(admin).allowMethod(signer.address, '0x00000000'),
      ).to.be.revertedWithCustomError(policy, 'ZeroValue');
      await expect(
        policy.connect(other).allowMethod(signer.address, APPROVE_SELECTOR),
      ).to.be.revertedWithCustomError(policy, 'UnauthorizedAdmin');
      await expect(
        policy.connect(admin).allowMethod(other.address, APPROVE_SELECTOR),
      ).to.be.revertedWithCustomError(policy, 'UnknownSigner');

      await policy
        .connect(admin)
        .revokeMethod(signer.address, TRANSFER_SELECTOR);
      expect(
        await policy.allowedMethod(signer.address, TRANSFER_SELECTOR),
      ).to.equal(false);
      expect(await policy.methodCount(signer.address)).to.equal(0n);
    });

    it('enforces the bounded per-signer method limit', async () => {
      const { policy, admin, signer } = await deploy();
      const max = Number(await policy.MAX_ENTRIES_PER_SIGNER());
      for (let i = 1; i <= max; i++) {
        const selector = ethers.zeroPadValue(ethers.toBeHex(i), 4);
        await policy.connect(admin).allowMethod(signer.address, selector);
      }
      expect(await policy.methodCount(signer.address)).to.equal(BigInt(max));
      await expect(
        policy
          .connect(admin)
          .allowMethod(
            signer.address,
            ethers.zeroPadValue(ethers.toBeHex(max + 1), 4),
          ),
      ).to.be.revertedWithCustomError(policy, 'LimitReached');
    });
  });

  describe('simulation-gated privileged execution', () => {
    it('executes an authorized operation exactly once and increments accounting once', async () => {
      const fixture = await deploy();
      const setup = await fullSetup(fixture);
      const { policy, executor, signer, recipient } = setup;
      const args = {
        operationId: id(1),
        signer,
        destination: recipient.address,
        selector: TRANSFER_SELECTOR,
      };

      expect(
        (
          await policy.checkAuthorization(
            args.operationId,
            signer.address,
            CHAIN_A,
            recipient.address,
            TRANSFER_SELECTOR,
            id(900),
          )
        ).ok,
      ).to.equal(true);

      await expect(authorize(policy, executor, args))
        .to.emit(policy, 'AuthorizationGranted')
        .withArgs(
          args.operationId,
          signer.address,
          CHAIN_A,
          recipient.address,
          TRANSFER_SELECTOR,
          executor.address,
        );
      expect(await policy.totalAuthorized()).to.equal(1n);
      expect((await policy.simulationFor(args.operationId)).consumed).to.equal(
        true,
      );
    });

    it('rejects unauthorized callers and missing simulations without mutating state', async () => {
      const fixture = await deploy();
      const { policy, admin, executor, signer, other, recipient } = fixture;
      await policy
        .connect(admin)
        .allowDestination(signer.address, CHAIN_A, recipient.address);
      await policy
        .connect(admin)
        .allowMethod(signer.address, TRANSFER_SELECTOR);

      const args = {
        operationId: id(2),
        signer,
        destination: recipient.address,
      };
      await expect(
        authorize(policy, other, args),
      ).to.be.revertedWithCustomError(policy, 'UnauthorizedExecutor');
      await expect(
        authorize(policy, executor, args),
      ).to.be.revertedWithCustomError(policy, 'SimulationMissing');
      expect(await policy.totalAuthorized()).to.equal(0n);
      const check = await policy.checkAuthorization(
        id(2),
        signer.address,
        CHAIN_A,
        recipient.address,
        TRANSFER_SELECTOR,
        id(900),
      );
      expect(check.ok).to.equal(false);
      expect(check.reasonCode).to.equal(1n);
    });

    it('rejects replayed and revoked operations', async () => {
      const fixture = await deploy();
      const setup = await fullSetup(fixture, id(3));
      const { policy, admin } = setup;
      const args = {
        operationId: id(3),
        signer: setup.signer,
        destination: setup.recipient.address,
      };
      const { executor } = fixture;

      await authorize(policy, executor, args);
      await expect(
        authorize(policy, executor, args),
      ).to.be.revertedWithCustomError(policy, 'MessageReplayed');
      await expect(
        policy.connect(admin).revokeSimulation(id(3), id(99)),
      ).to.be.revertedWithCustomError(policy, 'MessageReplayed');
      await expect(
        record(policy, admin, { ...args, operationId: id(3) }),
      ).to.be.revertedWithCustomError(policy, 'MessageReplayed');
      expect(await policy.totalAuthorized()).to.equal(1n);
    });

    it('rejects simulations that do not match the operation fields', async () => {
      const fixture = await deploy();
      const setup = await fullSetup(fixture, id(4));
      const { policy, executor, admin } = fixture;
      const base = {
        operationId: id(4),
        signer: setup.signer,
        destination: setup.recipient.address,
      };
      await policy
        .connect(admin)
        .allowDestination(setup.signer.address, CHAIN_A, setup.signer.address);
      await policy
        .connect(admin)
        .allowDestination(
          setup.signer.address,
          CHAIN_B,
          setup.recipient.address,
        );
      await policy
        .connect(admin)
        .allowMethod(setup.signer.address, APPROVE_SELECTOR);

      await expect(
        authorize(policy, executor, { ...base, chainId: CHAIN_B }),
      ).to.be.revertedWithCustomError(policy, 'SimulationMismatch');
      await expect(
        authorize(policy, executor, { ...base, selector: APPROVE_SELECTOR }),
      ).to.be.revertedWithCustomError(policy, 'SimulationMismatch');
      await expect(
        authorize(policy, executor, { ...base, payloadHash: id(901) }),
      ).to.be.revertedWithCustomError(policy, 'SimulationMismatch');
      await expect(
        authorize(policy, executor, {
          ...base,
          destination: setup.signer.address,
        }),
      ).to.be.revertedWithCustomError(policy, 'SimulationMismatch');
      expect(await policy.totalAuthorized()).to.equal(0n);

      await policy.connect(admin).revokeSimulation(id(4), id(98));
      await expect(
        authorize(policy, executor, base),
      ).to.be.revertedWithCustomError(policy, 'SimulationRevokedError');
    });

    it('fails closed when the simulation is stale or lacks required confirmations', async () => {
      const fixture = await deploy();
      const { policy, admin, executor, signer, recipient } = fixture;
      await policy
        .connect(admin)
        .allowDestination(signer.address, CHAIN_A, recipient.address);
      await policy
        .connect(admin)
        .allowMethod(signer.address, TRANSFER_SELECTOR);

      await policy
        .connect(admin)
        .setChainConfig(CHAIN_A, chainConfig(true, 3, 600));
      const currentBlock = await ethers.provider.getBlockNumber();
      const latest = await ethers.provider.getBlock('latest');
      await policy
        .connect(admin)
        .recordSimulation(
          id(5),
          signer.address,
          CHAIN_A,
          recipient.address,
          TRANSFER_SELECTOR,
          id(900),
          currentBlock,
          latest.timestamp,
          3,
        );
      const args = {
        operationId: id(5),
        signer,
        destination: recipient.address,
      };

      await expect(
        authorize(policy, executor, args),
      ).to.be.revertedWithCustomError(policy, 'ConfirmationsNotMet');
      await networkHelpers.mine(3);
      await expect(authorize(policy, executor, args)).to.not.be.revert(ethers);
      expect(await policy.totalAuthorized()).to.equal(1n);

      await record(policy, admin, {
        operationId: id(6),
        signer,
        destination: recipient.address,
      });
      await networkHelpers.time.increase(601);
      await expect(
        authorize(policy, executor, {
          operationId: id(6),
          signer,
          destination: recipient.address,
        }),
      ).to.be.revertedWithCustomError(policy, 'SimulationStale');
      expect(await policy.totalAuthorized()).to.equal(1n);
    });

    it('fails closed if permissions are revoked after a simulation is recorded', async () => {
      const fixture = await deploy();
      const setup = await fullSetup(fixture, id(7));
      const { policy, admin, executor } = fixture;
      const args = {
        operationId: id(7),
        signer: setup.signer,
        destination: setup.recipient.address,
      };

      await policy
        .connect(admin)
        .revokeDestination(
          setup.signer.address,
          CHAIN_A,
          setup.recipient.address,
        );
      await expect(
        authorize(policy, executor, args),
      ).to.be.revertedWithCustomError(policy, 'DestinationNotAllowed');
      await policy
        .connect(admin)
        .allowDestination(
          setup.signer.address,
          CHAIN_A,
          setup.recipient.address,
        );
      await policy
        .connect(admin)
        .revokeMethod(setup.signer.address, TRANSFER_SELECTOR);
      await expect(
        authorize(policy, executor, args),
      ).to.be.revertedWithCustomError(policy, 'MethodNotAllowed');
      await policy
        .connect(admin)
        .allowMethod(setup.signer.address, TRANSFER_SELECTOR);
      await policy.connect(admin).setSigner(setup.signer.address, false);
      await expect(
        authorize(policy, executor, args),
      ).to.be.revertedWithCustomError(policy, 'UnknownSigner');
      expect(await policy.totalAuthorized()).to.equal(0n);
    });

    it('supports operator recovery: revoke an unexecuted simulation, re-simulate, then consume once', async () => {
      const fixture = await deploy();
      const setup = await fullSetup(fixture, id(8));
      const { policy, admin, executor } = fixture;
      const args = {
        operationId: id(8),
        signer: setup.signer,
        destination: setup.recipient.address,
      };

      await expect(policy.connect(admin).revokeSimulation(id(8), id(77)))
        .to.emit(policy, 'SimulationRevoked')
        .withArgs(id(8), id(77));
      await expect(
        authorize(policy, executor, args),
      ).to.be.revertedWithCustomError(policy, 'SimulationRevokedError');
      await expect(
        policy.connect(admin).revokeSimulation(id(8), id(77)),
      ).to.not.be.revert(ethers);

      await record(policy, admin, { ...args, operationId: id(8) });
      expect(
        (
          await policy.checkAuthorization(
            id(8),
            setup.signer.address,
            CHAIN_A,
            setup.recipient.address,
            TRANSFER_SELECTOR,
            id(900),
          )
        ).ok,
      ).to.equal(true);
      await authorize(policy, executor, args);
      await expect(
        authorize(policy, executor, args),
      ).to.be.revertedWithCustomError(policy, 'MessageReplayed');
      expect(await policy.totalAuthorized()).to.equal(1n);
    });

    it('rejects simulations recorded for disallowed destinations, methods or chains', async () => {
      const { policy, admin, signer, other, recipient } = await deploy();
      await policy
        .connect(admin)
        .allowDestination(signer.address, CHAIN_A, recipient.address);
      await policy
        .connect(admin)
        .allowMethod(signer.address, TRANSFER_SELECTOR);

      await expect(
        record(policy, admin, {
          operationId: id(10),
          signer,
          destination: other.address,
        }),
      ).to.be.revertedWithCustomError(policy, 'DestinationNotAllowed');
      await expect(
        record(policy, admin, {
          operationId: id(11),
          signer,
          destination: recipient.address,
          selector: APPROVE_SELECTOR,
        }),
      ).to.be.revertedWithCustomError(policy, 'MethodNotAllowed');
      await expect(
        record(policy, admin, {
          operationId: id(12),
          signer,
          destination: recipient.address,
          chainId: CHAIN_DISABLED,
        }),
      ).to.be.revertedWithCustomError(policy, 'ChainDisabled');
      await expect(
        record(policy, admin, {
          operationId: id(13),
          signer,
          destination: recipient.address,
          payloadHash: ethers.ZeroHash,
        }),
      ).to.be.revertedWithCustomError(policy, 'ZeroValue');
      await expect(
        record(policy, admin, {
          operationId: id(14),
          signer,
          destination: recipient.address,
          confirmations: 1,
        }),
      ).to.be.revertedWithCustomError(policy, 'ConfirmationsNotMet');
      await expect(
        record(policy, admin, {
          operationId: ethers.ZeroHash,
          signer,
          destination: recipient.address,
        }),
      ).to.be.revertedWithCustomError(policy, 'ZeroValue');
      await expect(
        record(policy, admin, { operationId: id(15), signer: other }),
      ).to.be.revertedWithCustomError(policy, 'UnknownSigner');
    });
  });

  describe('worst-case gas bounds', () => {
    it('keeps authorization O(1) even with full allowlists', async () => {
      const fixture = await deploy();
      const { policy, admin, signer, recipient, executor } = fixture;
      const max = Number(await policy.MAX_ENTRIES_PER_SIGNER());
      await policy
        .connect(admin)
        .allowDestination(signer.address, CHAIN_A, recipient.address);
      await policy
        .connect(admin)
        .allowMethod(signer.address, TRANSFER_SELECTOR);
      for (let i = 0; i < max - 1; i++) {
        await policy
          .connect(admin)
          .allowDestination(
            signer.address,
            CHAIN_A,
            ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(i + 100), 20)),
          );
        await policy
          .connect(admin)
          .allowMethod(
            signer.address,
            ethers.zeroPadValue(ethers.toBeHex(i + 100), 4),
          );
      }
      await record(policy, admin, {
        operationId: id(20),
        signer,
        destination: recipient.address,
        selector: TRANSFER_SELECTOR,
      });

      const receipt = await (
        await authorize(policy, executor, {
          operationId: id(20),
          signer,
          destination: recipient.address,
          selector: TRANSFER_SELECTOR,
        })
      ).wait();
      const gasUsed = Number(receipt!.gasUsed);
      console.log(
        `      [gas] authorizeAndConsume with full allowlists: ${gasUsed}`,
      );
      expect(gasUsed).to.be.greaterThan(0);
      expect(gasUsed).to.be.lessThan(200_000);
    });
  });
});
