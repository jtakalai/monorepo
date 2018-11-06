import * as ethers from "ethers";

import { AbstractContract, expect } from "../../utils";
import * as Utils from "../../utils/misc";

const web3 = (global as any).web3;
const { provider, unlockedAccount } = Utils.setupTestEnv(web3);

// HELPER DATA
enum Status {
  ON,
  DISPUTE,
  OFF
}
const TIMEOUT = 30;
const [A, B] = [
  // 0xb37e49bFC97A948617bF3B63BC6942BB15285715
  new ethers.Wallet(
    "0x4ccac8b1e81fb18a98bbaf29b9bfe307885561f71b76bd4680d7aec9d0ddfcfd"
  ),
  // 0xaeF082d339D227646DB914f0cA9fF02c8544F30b
  new ethers.Wallet(
    "0x3570f77380e22f8dc2274d8fd33e7830cc2d29cf76804e8c21f4f7a6cc571d27"
  )
];

// HELPER FUNCTION
const computeHash = (stateHash: string, nonce: number, timeout: number) =>
  ethers.utils.solidityKeccak256(
    ["bytes1", "address[]", "uint256", "uint256", "bytes32"],
    ["0x19", [A.address, B.address], nonce, timeout, stateHash]
  );

contract("AppRegistry", (accounts: string[]) => {
  const TEST_ID = ethers.utils.solidityKeccak256(
    ["address", "address[]", "bytes32", "bytes32", "uint256"],
    [
      accounts[0],
      [A.address, B.address],
      ethers.constants.HashZero,
      ethers.constants.HashZero,
      10
    ]
  );

  let judge: ethers.Contract;

  let sendUpdateToChainWithNonce: (
    nonce: number,
    appState?: string
  ) => Promise<void>;

  let sendSignedUpdateToChainWithNonce: (
    nonce: number,
    appState?: string
  ) => Promise<void>;

  let sendSignedFinalizationToChain: () => Promise<any>;

  const latestState = async () => {
    const c = await judge.functions.getAppInstance(TEST_ID);
    return c.state.appStateHash;
  };
  const latestNonce = async () => judge.functions.latestNonce(TEST_ID);

  // @ts-ignore
  beforeEach(async () => {
    const appRegistry = await AbstractContract.loadBuildArtifact(
      "AppRegistry",
      {
        StaticCall: AbstractContract.loadBuildArtifact("StaticCall"),
        Signatures: AbstractContract.loadBuildArtifact("Signatures"),
        Transfer: AbstractContract.loadBuildArtifact("Transfer")
      }
    );

    judge = await appRegistry.deploy(unlockedAccount);

    await judge.functions.registerAppInstance(
      accounts[0],
      [A.address, B.address],
      ethers.constants.HashZero,
      ethers.constants.HashZero,
      10
    );

    sendUpdateToChainWithNonce = (nonce: number, appState?: string) =>
      judge.functions.setState(
        TEST_ID,
        appState || ethers.constants.HashZero,
        nonce,
        TIMEOUT,
        "0x"
      );

    sendSignedUpdateToChainWithNonce = (nonce: number, appState?: string) =>
      judge.functions.setState(
        TEST_ID,
        appState || ethers.constants.HashZero,
        nonce,
        TIMEOUT,
        Utils.signMessage(
          computeHash(appState || ethers.constants.HashZero, nonce, TIMEOUT),
          unlockedAccount
        )
      );

    sendSignedFinalizationToChain = async () =>
      judge.functions.setState(
        TEST_ID,
        await latestState(),
        await latestNonce(),
        0,
        Utils.signMessage(
          computeHash(await latestState(), await latestNonce(), 0),
          unlockedAccount
        )
      );
  });

  it("constructor sets initial state", async () => {
    const owner = await judge.functions.getOwner(TEST_ID);
    const signingKeys = await judge.functions.getSigningKeys(TEST_ID);
    expect(owner).to.be.equalIgnoreCase(accounts[0]);
    expect(signingKeys[0]).to.be.equalIgnoreCase(A.address);
    expect(signingKeys[1]).to.be.equalIgnoreCase(B.address);
  });

  it("should start without a dispute if deployed", async () => {
    const state = (await judge.functions.getAppInstance(TEST_ID)).state;
    expect(state.status).to.be.equal(Status.ON);
  });

  describe("updating app state", async () => {
    describe("with owner", async () => {
      it("should work with higher nonce", async () => {
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(0));
        await sendUpdateToChainWithNonce(1);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(1));
      });

      it("should work many times", async () => {
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(0));
        await sendUpdateToChainWithNonce(1);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(1));
        await sendUpdateToChainWithNonce(2);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(2));
        await sendUpdateToChainWithNonce(3);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(3));
      });

      it("should work with much higher nonce", async () => {
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(0));
        await sendUpdateToChainWithNonce(1000);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(1000));
      });

      it("shouldn't work with an equal nonce", async () => {
        await Utils.assertRejects(sendUpdateToChainWithNonce(0));
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(0));
      });

      it("shouldn't work with an lower nonce", async () => {
        await sendUpdateToChainWithNonce(1);
        await Utils.assertRejects(sendUpdateToChainWithNonce(0));
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(1));
      });
    });

    describe("with signing keys", async () => {
      it("should work with higher nonce", async () => {
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(0));
        await sendSignedUpdateToChainWithNonce(1);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(1));
      });

      it("should work many times", async () => {
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(0));
        await sendSignedUpdateToChainWithNonce(1);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(1));
        await sendSignedUpdateToChainWithNonce(2);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(2));
        await sendSignedUpdateToChainWithNonce(3);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(3));
      });

      it("should work with much higher nonce", async () => {
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(0));
        await sendSignedUpdateToChainWithNonce(1000);
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(1000));
      });

      it("shouldn't work with an equal nonce", async () => {
        await Utils.assertRejects(sendSignedUpdateToChainWithNonce(0));
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(0));
      });

      it("shouldn't work with an lower nonce", async () => {
        await sendSignedUpdateToChainWithNonce(1);
        await Utils.assertRejects(sendSignedUpdateToChainWithNonce(0));
        expect(await latestNonce()).to.be.eql(new ethers.utils.BigNumber(1));
      });
    });
  });

  describe("finalizing app state", async () => {
    it("should work with owner", async () => {
      expect(await judge.functions.isClosed(TEST_ID)).to.be.equal(false);
      await judge.functions.setState(
        TEST_ID,
        await latestState(),
        await latestNonce(),
        0,
        ethers.constants.HashZero
      );
      expect(await judge.functions.isClosed(TEST_ID)).to.be.equal(true);
    });

    it("should work with keys", async () => {
      expect(await judge.functions.isClosed(TEST_ID)).to.be.equal(false);
      await sendSignedFinalizationToChain();
      expect(await judge.functions.isClosed(TEST_ID)).to.be.equal(true);
    });
  });

  describe("waiting for timeout", async () => {
    it("should block updates after the timeout", async () => {
      expect(await judge.functions.isClosed(TEST_ID)).to.be.equal(false);
      await sendUpdateToChainWithNonce(1);
      await Utils.mineBlocks(TIMEOUT);
      expect(await judge.functions.isClosed(TEST_ID)).to.be.equal(true);
      await Utils.assertRejects(sendUpdateToChainWithNonce(2));
      await Utils.assertRejects(sendSignedUpdateToChainWithNonce(0));
    });
  });
});
