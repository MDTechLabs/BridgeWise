import { expect } from 'chai';
import hre from 'hardhat';

const CHAINS = [1, 137, 56];
const DISABLED_CHAIN = 9999;
const SELECTORS = ['0xa9059cbb', '0x095ea7b3', '0x23b872dd', '0x128acb08'];

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('SignerPolicy — stateful fuzz and accounting invariants', () => {
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

  function destination(n: number): string {
    return ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(n), 20));
  }

  it('preserves allowlist, replay and accounting invariants across randomized transitions', async () => {
    const rand = mulberry32(0x15131514);
    const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];

    const [admin, executor, signer, rogue] = await ethers.getSigners();
    const signers = [signer, rogue];
    const Factory = await ethers.getContractFactory('SignerPolicy');
    const policy = await Factory.deploy(
      admin.address,
      [CHAINS[0], CHAINS[1], CHAINS[2]],
      [
        { enabled: true, requiredConfirmations: 2, maxSimulationAge: 3600 },
        { enabled: true, requiredConfirmations: 1, maxSimulationAge: 3600 },
        { enabled: false, requiredConfirmations: 1, maxSimulationAge: 3600 },
      ],
    );
    await policy.waitForDeployment();
    await policy.connect(admin).setExecutor(executor.address, true);
    await policy.connect(admin).setSigner(signer.address, true);

    const enabledChains = new Set<number>([CHAINS[0], CHAINS[1]]);
    const requiredConfirmations = new Map<number, number>([
      [CHAINS[0], 2],
      [CHAINS[1], 1],
    ]);
    const activeSigners = new Set<string>([signer.address]);
    const destinations = new Map<string, boolean>();
    const methods = new Map<string, boolean>();
    const simulations = new Map<string, any>();
    let expectedAuthorized = 0;

    const destKey = (who: string, chainId: number, to: string) =>
      `${who}:${chainId}:${to}`;
    const methodKey = (who: string, selector: string) => `${who}:${selector}`;

    for (const chainId of [CHAINS[0], CHAINS[1]]) {
      for (const n of [1, 2, 3]) {
        await policy
          .connect(admin)
          .allowDestination(signer.address, chainId, destination(n));
        destinations.set(
          destKey(signer.address, chainId, destination(n)),
          true,
        );
      }
    }
    for (const selector of SELECTORS.slice(0, 2)) {
      await policy.connect(admin).allowMethod(signer.address, selector);
      methods.set(methodKey(signer.address, selector), true);
    }

    async function assertInvariants() {
      for (const account of signers) {
        let expectedDestinations = 0;
        for (const [key, value] of destinations) {
          if (key.startsWith(`${account.address}:`) && value)
            expectedDestinations += 1;
        }
        let expectedMethods = 0;
        for (const [key, value] of methods) {
          if (key.startsWith(`${account.address}:`) && value)
            expectedMethods += 1;
        }
        expect(await policy.destinationCount(account.address)).to.equal(
          BigInt(expectedDestinations),
          'destinationCount diverged from model',
        );
        expect(await policy.methodCount(account.address)).to.equal(
          BigInt(expectedMethods),
          'methodCount diverged from model',
        );
      }
      expect(await policy.totalAuthorized()).to.equal(
        BigInt(expectedAuthorized),
        'totalAuthorized diverged from successful authorizations',
      );
      const consumed = [...simulations.values()].filter((sim) => sim.consumed);
      expect(new Set(consumed.map((sim) => sim.opId)).size).to.equal(
        consumed.length,
        'an operation was consumed more than once',
      );
    }

    const steps = 200;
    for (let step = 0; step < steps; step++) {
      const draw = rand();
      const action =
        draw < 0.45
          ? 7
          : draw < 0.67
            ? 5
            : draw < 0.73
              ? 6
              : Math.floor(rand() * 5);
      const who = pick(signers);
      const chainId = pick([...CHAINS, DISABLED_CHAIN]);
      const to = destination(1 + Math.floor(rand() * 6));
      const selector = pick(SELECTORS);

      if (action === 0) {
        const key = destKey(who.address, chainId, to);
        const currentCount = [...destinations.entries()].filter(
          ([k, v]) => k.startsWith(`${who.address}:`) && v,
        ).length;
        const canAllow =
          activeSigners.has(who.address) &&
          enabledChains.has(chainId) &&
          (destinations.get(key) === true || currentCount < 64);
        if (canAllow) {
          await policy
            .connect(admin)
            .allowDestination(who.address, chainId, to);
          destinations.set(key, true);
        } else {
          await expect(
            policy.connect(admin).allowDestination(who.address, chainId, to),
          ).to.be.revert(ethers);
        }
      } else if (action === 1) {
        const key = destKey(who.address, chainId, to);
        await policy.connect(admin).revokeDestination(who.address, chainId, to);
        destinations.set(key, false);
      } else if (action === 2) {
        const key = methodKey(who.address, selector);
        const currentCount = [...methods.entries()].filter(
          ([k, v]) => k.startsWith(`${who.address}:`) && v,
        ).length;
        const canAllow =
          activeSigners.has(who.address) &&
          (methods.get(key) === true || currentCount < 64);
        if (canAllow) {
          await policy.connect(admin).allowMethod(who.address, selector);
          methods.set(key, true);
        } else {
          await expect(
            policy.connect(admin).allowMethod(who.address, selector),
          ).to.be.revert(ethers);
        }
      } else if (action === 3) {
        const key = methodKey(who.address, selector);
        await policy.connect(admin).revokeMethod(who.address, selector);
        methods.set(key, false);
      } else if (action === 4) {
        const allowed =
          who.address === signer.address
            ? true
            : !activeSigners.has(who.address);
        await policy.connect(admin).setSigner(who.address, allowed);
        if (allowed) activeSigners.add(who.address);
        else activeSigners.delete(who.address);
      } else if (action === 5) {
        const opId = id(1000 + step);
        const payloadHash = id(2000 + step);
        const allowedDestinations = [...destinations.entries()]
          .filter(([key, value]) => value && key.startsWith(`${who.address}:`))
          .map(([key]) => {
            const parts = key.split(':');
            return { chainId: Number(parts[1]), to: parts[2] };
          })
          .filter((candidate) => enabledChains.has(candidate.chainId));
        const allowedMethods = [...methods.entries()]
          .filter(([key, value]) => value && key.startsWith(`${who.address}:`))
          .map(([key]) => key.split(':')[1]);
        const chosen =
          allowedDestinations.length > 0 &&
          allowedMethods.length > 0 &&
          rand() < 0.8
            ? pick(allowedDestinations)
            : null;
        const simChainId = chosen ? chosen.chainId : chainId;
        const simTo = chosen ? chosen.to : to;
        const simSelector = chosen ? pick(allowedMethods) : selector;
        const allowed =
          activeSigners.has(who.address) &&
          enabledChains.has(simChainId) &&
          destinations.get(destKey(who.address, simChainId, simTo)) === true &&
          methods.get(methodKey(who.address, simSelector)) === true;
        const prior = simulations.get(opId);
        const currentBlock = await ethers.provider.getBlockNumber();
        const latest = await ethers.provider.getBlock('latest');
        const confirmations = requiredConfirmations.get(simChainId) ?? 1;

        if (allowed && (!prior || prior.revoked || prior.consumed)) {
          await policy
            .connect(admin)
            .recordSimulation(
              opId,
              who.address,
              simChainId,
              simTo,
              simSelector,
              payloadHash,
              currentBlock - confirmations,
              latest.timestamp,
              confirmations,
            );
          simulations.set(opId, {
            opId,
            signer: who,
            chainId: simChainId,
            to: simTo,
            selector: simSelector,
            payloadHash,
            revoked: false,
            consumed: false,
            observedBlock: currentBlock - confirmations,
          });
        } else {
          await expect(
            policy
              .connect(admin)
              .recordSimulation(
                opId,
                who.address,
                simChainId,
                simTo,
                simSelector,
                payloadHash,
                currentBlock - confirmations,
                latest.timestamp,
                confirmations,
              ),
          ).to.be.revert(ethers);
        }
      } else if (action === 6) {
        const all = [...simulations.keys()];
        if (all.length === 0) continue;
        const opId = pick(all);
        const sim = simulations.get(opId);
        if (!sim.consumed) {
          await policy.connect(admin).revokeSimulation(opId, id(3000 + step));
          sim.revoked = true;
        } else {
          await expect(
            policy.connect(admin).revokeSimulation(opId, id(3000 + step)),
          ).to.be.revertedWithCustomError(policy, 'MessageReplayed');
        }
      } else if (action === 7) {
        const all = [...simulations.keys()];
        if (all.length === 0) continue;
        const usable = all.filter((key) => {
          const candidate = simulations.get(key);
          return !candidate.consumed && !candidate.revoked;
        });
        const opId = pick(usable.length > 0 ? usable : all);
        const sim = simulations.get(opId);
        const mutate = rand() < 0.25;
        const caller = rand() < 0.15 ? rogue : executor;
        const args: any = {
          opId,
          who: sim.signer,
          chainId: sim.chainId,
          to: sim.to,
          selector: mutate ? pick(SELECTORS) : sim.selector,
          payloadHash: mutate ? id(4000 + step) : sim.payloadHash,
        };
        const sameFields =
          args.chainId === sim.chainId &&
          args.to === sim.to &&
          args.selector === sim.selector &&
          args.payloadHash === sim.payloadHash;
        const currentBlock = await ethers.provider.getBlockNumber();
        const confirmationsMet =
          currentBlock >=
          sim.observedBlock + (requiredConfirmations.get(sim.chainId) ?? 1);
        const shouldSucceed =
          caller === executor &&
          !sim.consumed &&
          !sim.revoked &&
          sameFields &&
          confirmationsMet &&
          activeSigners.has(sim.signer.address) &&
          enabledChains.has(sim.chainId) &&
          destinations.get(destKey(sim.signer.address, sim.chainId, sim.to)) ===
            true &&
          methods.get(methodKey(sim.signer.address, sim.selector)) === true;
        if (shouldSucceed) {
          await expect(
            policy
              .connect(caller)
              .authorizeAndConsume(
                opId,
                args.who.address,
                args.chainId,
                args.to,
                args.selector,
                args.payloadHash,
              ),
          ).to.emit(policy, 'AuthorizationGranted');
          sim.consumed = true;
          expectedAuthorized += 1;
        } else {
          await expect(
            policy
              .connect(caller)
              .authorizeAndConsume(
                opId,
                args.who.address,
                args.chainId,
                args.to,
                args.selector,
                args.payloadHash,
              ),
          ).to.be.revert(ethers);
        }
      } else {
        const nextChain = pick([CHAINS[0], CHAINS[1], CHAINS[2]]);
        const enabled = nextChain !== CHAINS[2];
        const confirmations = requiredConfirmations.get(nextChain) ?? 1;
        await policy.connect(admin).setChainConfig(nextChain, {
          enabled,
          requiredConfirmations: confirmations,
          maxSimulationAge: 3600,
        });
        if (enabled) {
          enabledChains.add(nextChain);
          requiredConfirmations.set(nextChain, confirmations);
        } else {
          enabledChains.delete(nextChain);
        }
      }

      await assertInvariants();
    }

    const consumedIds = [...simulations.values()]
      .filter((sim) => sim.consumed)
      .map((sim) => sim.opId);
    expect(consumedIds.length).to.be.greaterThan(
      0,
      'fuzz run never reached a successful authorization',
    );
    for (const opId of consumedIds) {
      const stored = await policy.simulationFor(opId);
      expect(stored.consumed).to.equal(true);
      await expect(
        policy
          .connect(executor)
          .authorizeAndConsume(
            opId,
            simulations.get(opId).signer.address,
            simulations.get(opId).chainId,
            simulations.get(opId).to,
            simulations.get(opId).selector,
            simulations.get(opId).payloadHash,
          ),
      ).to.be.revertedWithCustomError(policy, 'MessageReplayed');
    }
    console.log(
      `      [fuzz] ${steps} randomized transitions, ${expectedAuthorized} unique authorizations, invariants held`,
    );
  });
});
