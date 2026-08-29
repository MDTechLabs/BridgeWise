import { expect } from 'chai';
import hre from 'hardhat';

describe('CalldataSlicer', function () {
  this.timeout(120_000);

  let ethers: any;

  before(async function () {
    this.timeout(120_000);
    const connection = await hre.network.create();
    ethers = connection.ethers;
  });

  async function deploy() {
    const Harness = await ethers.getContractFactory('CalldataSlicerHarness');
    const harness = await Harness.deploy();
    await harness.waitForDeployment();
    return { harness };
  }

  function encodeBytes(value: string): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [value]);
  }

  function encodeWords(words: string[]): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [words]);
  }

  function xorWords(words: string[]): string {
    let acc = 0n;
    for (const w of words) {
      acc ^= BigInt(w);
    }
    return ethers.toBeHex(acc, 32);
  }

  const WORD_A =
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const WORD_B =
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const WORD_C =
    '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  const WORD_D =
    '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

  // --- bytes slicing ---

  it('echoes a mid-range bytes slice', async () => {
    const { harness } = await deploy();
    const data = ethers.hexlify(ethers.toUtf8Bytes('bridgewise-calldata'));

    expect(await harness.echoBytes(data, 0, 10)).to.equal(
      ethers.hexlify(ethers.toUtf8Bytes('bridgewise')),
    );
    expect(await harness.echoBytes(data, 11, 19)).to.equal(
      ethers.hexlify(ethers.toUtf8Bytes('calldata')),
    );
  });

  it('echoes the full range and empty slices', async () => {
    const { harness } = await deploy();
    const data = '0x01020304';

    expect(await harness.echoBytes(data, 0, 4)).to.equal(data);
    expect(await harness.echoBytes(data, 0, 0)).to.equal('0x');
    expect(await harness.echoBytes(data, 4, 4)).to.equal('0x');
    expect(await harness.echoBytes(data, 2, 2)).to.equal('0x');
  });

  it('echoes an empty source as an empty slice', async () => {
    const { harness } = await deploy();
    expect(await harness.echoBytes('0x', 0, 0)).to.equal('0x');
  });

  it('returns offset = sourceOffset + start and length = end - start', async () => {
    const { harness } = await deploy();
    const data = '0x0011223344556677';
    const start = 2n;
    const end = 6n;

    const [offset, length, sourceOffset] = await harness.sliceBytesPointers(
      data,
      start,
      end,
    );
    expect(length).to.equal(end - start);
    expect(offset).to.equal(sourceOffset + start);
  });

  // --- word / address array slicing ---

  it('echoes a mid-range bytes32[] slice', async () => {
    const { harness } = await deploy();
    const sliced = await harness.echoWords(
      [WORD_A, WORD_B, WORD_C, WORD_D],
      1,
      3,
    );
    expect(sliced).to.deep.equal([WORD_B, WORD_C]);
  });

  it('echoes a mid-range address[] slice', async () => {
    const { harness } = await deploy();
    const addrs = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
    ];
    expect(await harness.echoAddresses(addrs, 1, 3)).to.deep.equal([
      ethers.getAddress(addrs[1]),
      ethers.getAddress(addrs[2]),
    ]);
  });

  it('returns word-array offset = sourceOffset + start*32', async () => {
    const { harness } = await deploy();
    const start = 1n;
    const end = 3n;
    const [offset, length, sourceOffset] = await harness.sliceWordsPointers(
      [WORD_A, WORD_B, WORD_C, WORD_D],
      start,
      end,
    );
    expect(length).to.equal(2n);
    expect(offset).to.equal(sourceOffset + start * 32n);
  });

  it('loads a sliced word via calldataload', async () => {
    const { harness } = await deploy();
    expect(
      await harness.wordAtSlice([WORD_A, WORD_B, WORD_C], 1, 3, 0),
    ).to.equal(WORD_B);
    expect(
      await harness.wordAtSlice([WORD_A, WORD_B, WORD_C], 1, 3, 1),
    ).to.equal(WORD_C);
  });

  it('loads a 32-byte window out of a bytes slice', async () => {
    const { harness } = await deploy();
    const data = ethers.concat([WORD_A, WORD_B]);
    expect(await harness.loadWord(data, 0)).to.equal(WORD_A);
    expect(await harness.loadWord(data, 32)).to.equal(WORD_B);
  });

  it('loads a sliced address via calldataload', async () => {
    const { harness } = await deploy();
    const addrs = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
    ];
    expect(await harness.addressAtSlice(addrs, 1, 3, 0)).to.equal(
      ethers.getAddress(addrs[1]),
    );
  });

  // --- nested ABI extraction via calldataload ---

  it('extracts a nested bytes payload from an ABI-encoded buffer', async () => {
    const { harness } = await deploy();
    const inner = ethers.hexlify(ethers.toUtf8Bytes('hello-bridge'));
    const encoded = encodeBytes(inner);
    expect(await harness.echoExtractedBytes(encoded, 0)).to.equal(inner);
  });

  it('extracts a nested bytes32[] payload from an ABI-encoded buffer', async () => {
    const { harness } = await deploy();
    const inner = [WORD_A, WORD_B, WORD_C];
    const encoded = encodeWords(inner);
    expect(await harness.echoExtractedWords(encoded, 0)).to.deep.equal(inner);
  });

  it('extracts the second dynamic field of a two-arg ABI encoding', async () => {
    const { harness } = await deploy();
    const innerBytes = '0xabcd';
    const innerWords = [WORD_A, WORD_D];
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32[]', 'bytes'],
      [innerWords, innerBytes],
    );

    expect(await harness.echoExtractedWords(encoded, 0)).to.deep.equal(
      innerWords,
    );
    expect(await harness.echoExtractedBytes(encoded, 32)).to.equal(innerBytes);
  });

  it('extracted bytes length matches the nested payload', async () => {
    const { harness } = await deploy();
    const inner = '0x1122334455';
    const [, length] = await harness.extractedBytesPointers(
      encodeBytes(inner),
      0,
    );
    expect(length).to.equal(5n);
  });

  // --- zero dynamic memory allocation ---

  it('does not advance the free memory pointer while slicing bytes', async () => {
    const { harness } = await deploy();
    const [before, after] = await harness.freeMemAfterBytesSlice(
      '0x00112233445566778899',
      2,
      8,
    );
    expect(after).to.equal(before);
  });

  it('does not advance the free memory pointer while extracting nested bytes', async () => {
    const { harness } = await deploy();
    const encoded = encodeBytes('0xdeadbeef');
    const [before, after] = await harness.freeMemAfterExtract(encoded, 0);
    expect(after).to.equal(before);
  });

  // --- pass zero-copy pointers to verifier logic ---

  it('passes a sliced word array to low-level verifier logic', async () => {
    const { harness } = await deploy();
    const words = [WORD_A, WORD_B, WORD_C, WORD_D];
    expect(await harness.xorSlice(words, 1, 4)).to.equal(
      xorWords([WORD_B, WORD_C, WORD_D]),
    );
  });

  it('passes an extracted nested word array to low-level verifier logic', async () => {
    const { harness } = await deploy();
    const words = [WORD_A, WORD_C];
    expect(await harness.xorExtracted(encodeWords(words), 0)).to.equal(
      xorWords(words),
    );
  });

  it('XOR-reduces an empty slice to zero', async () => {
    const { harness } = await deploy();
    expect(await harness.xorSlice([WORD_A, WORD_B], 1, 1)).to.equal(
      ethers.ZeroHash,
    );
  });

  // --- array bounds safety ---

  it('reverts when end is past the bytes length', async () => {
    const { harness } = await deploy();
    await expect(
      harness.echoBytes('0x0102', 0, 3),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });

  it('reverts when start is greater than end', async () => {
    const { harness } = await deploy();
    await expect(
      harness.echoBytes('0x010203', 2, 1),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });

  it('reverts when a word-array slice is out of bounds', async () => {
    const { harness } = await deploy();
    await expect(
      harness.echoWords([WORD_A, WORD_B], 0, 3),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
    await expect(
      harness.echoWords([WORD_A, WORD_B], 2, 1),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });

  it('reverts when wordAt reads past the sliced range', async () => {
    const { harness } = await deploy();
    await expect(
      harness.wordAtSlice([WORD_A, WORD_B, WORD_C], 1, 2, 1),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });

  it('reverts when loadWord would read past the byte array', async () => {
    const { harness } = await deploy();
    await expect(
      harness.loadWord('0x00112233', 1),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });

  it('reverts when the nested ABI offset pointer is out of range', async () => {
    const { harness } = await deploy();
    await expect(
      harness.echoExtractedBytes('0x01', 0),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });

  it('reverts when the nested ABI length exceeds the outer buffer', async () => {
    const { harness } = await deploy();
    // offset = 0x20, length = 0x40, but only 32 bytes of payload follow
    const crafted = ethers.concat([
      ethers.zeroPadValue('0x20', 32),
      ethers.zeroPadValue('0x40', 32),
      ethers.zeroPadValue('0x01', 32),
    ]);
    await expect(
      harness.echoExtractedBytes(crafted, 0),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });

  it('reverts when extractWords length * 32 overflows', async () => {
    const { harness } = await deploy();
    const hugeLen = (1n << 252n) + 1n;
    const crafted = ethers.concat([
      ethers.zeroPadValue('0x20', 32),
      ethers.zeroPadValue(ethers.toBeHex(hugeLen), 32),
    ]);
    await expect(
      harness.echoExtractedWords(crafted, 0),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });

  it('reverts when headOffset itself is past the outer buffer', async () => {
    const { harness } = await deploy();
    const encoded = encodeBytes('0x11');
    await expect(
      harness.echoExtractedBytes(encoded, ethers.dataLength(encoded)),
    ).to.be.revertedWithCustomError(harness, 'SliceOutOfBounds');
  });
});
