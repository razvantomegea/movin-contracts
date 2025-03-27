import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MovinToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("MovinToken", function () {
  let movinToken: MovinToken;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;
  let initialSupply: bigint;

  beforeEach(async function () {
    // Get the signers
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy the token contract
    const MovinToken = await ethers.getContractFactory("MovinToken");
    movinToken = await upgrades.deployProxy(
      MovinToken,
      [owner.address],
      { kind: "uups", initializer: "initialize" }
    ) as unknown as MovinToken;

    await movinToken.waitForDeployment();
    initialSupply = await movinToken.totalSupply();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await movinToken.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await movinToken.balanceOf(owner.address);
      expect(await movinToken.totalSupply()).to.equal(ownerBalance);
    });
  });

  describe("Pausable functionality", function () {
    it("Should allow owner to pause and unpause", async function () {
      // Pause the contract
      await movinToken.pause();
      expect(await movinToken.paused()).to.equal(true);

      // Try to transfer tokens while paused (should fail)
      await expect(
        movinToken.transfer(addr1.address, 100)
      ).to.be.reverted;

      // Unpause the contract
      await movinToken.unpause();
      expect(await movinToken.paused()).to.equal(false);

      // Transfer should work now
      await movinToken.transfer(addr1.address, 100);
      expect(await movinToken.balanceOf(addr1.address)).to.equal(100);
    });

    it("Should not allow non-owner to pause", async function () {
      await expect(
        movinToken.connect(addr1).pause()
      ).to.be.reverted;
    });
  });

  describe("Transactions", function () {
    beforeEach(async function () {
      // Transfer 100 tokens from owner to addr1
      await movinToken.transfer(addr1.address, 100);
    });

    it("Should transfer tokens between accounts", async function () {
      // Transfer 50 tokens from addr1 to addr2
      await movinToken.connect(addr1).transfer(addr2.address, 50);
      
      // Check balances
      expect(await movinToken.balanceOf(addr1.address)).to.equal(50);
      expect(await movinToken.balanceOf(addr2.address)).to.equal(50);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      // Try to send 101 tokens from addr1 (only has 100)
      await expect(
        movinToken.connect(addr1).transfer(addr2.address, 101)
      ).to.be.reverted;

      // Balances shouldn't have changed
      expect(await movinToken.balanceOf(addr1.address)).to.equal(100);
      expect(await movinToken.balanceOf(addr2.address)).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint tokens", async function () {
      await movinToken.mint(addr1.address, 1000);
      expect(await movinToken.balanceOf(addr1.address)).to.equal(1000);
    });

    it("Should not allow non-owner to mint tokens", async function () {
      await expect(
        movinToken.connect(addr1).mint(addr1.address, 1000)
      ).to.be.reverted;
    });
    
    it("Should not allow minting to zero address", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      await expect(
        movinToken.mint(zeroAddress, 1000)
      ).to.be.revertedWithCustomError(movinToken, "InvalidAddress");
    });
    
    it("Should not allow minting zero amount", async function () {
      await expect(
        movinToken.mint(addr1.address, 0)
      ).to.be.revertedWithCustomError(movinToken, "ZeroAmountNotAllowed");
    });
  });
  
  describe("Max Supply", function () {
    it("Should have correct MAX_SUPPLY value", async function () {
      const maxSupply = await movinToken.MAX_SUPPLY();
      expect(maxSupply).to.equal(ethers.parseEther("1000000000000")); // 1 trillion with 18 decimals
    });
    
    it("Should not allow minting beyond MAX_SUPPLY", async function () {
      const totalSupply = await movinToken.totalSupply();
      const maxSupply = await movinToken.MAX_SUPPLY();
      const remainingSupply = maxSupply - totalSupply;
      
      // Try to mint more than the remaining supply
      await expect(
        movinToken.mint(addr1.address, remainingSupply + BigInt(1))
      ).to.be.revertedWithCustomError(movinToken, "ExceedsMaxSupply");
    });
    
    it("Should allow minting up to MAX_SUPPLY", async function () {
      const totalSupply = await movinToken.totalSupply();
      const maxSupply = await movinToken.MAX_SUPPLY();
      const remainingSupply = maxSupply - totalSupply;
      
      // Mint exactly the remaining supply
      await movinToken.mint(addr1.address, remainingSupply);
      
      // Check that totalSupply is now equal to MAX_SUPPLY
      expect(await movinToken.totalSupply()).to.equal(maxSupply);
      
      // Try to mint 1 more token (should fail)
      await expect(
        movinToken.mint(addr1.address, 1)
      ).to.be.revertedWithCustomError(movinToken, "ExceedsMaxSupply");
    });
  });

  describe("Burn Functionality", function () {
    it("Should allow owner to burn their tokens", async function () {
      const burnAmount = ethers.parseEther("1000");
      
      // Check initial balances
      const initialOwnerBalance = await movinToken.balanceOf(owner.address);
      
      // Burn tokens
      await movinToken.burn(burnAmount);
      
      // Check balances after burning
      const finalOwnerBalance = await movinToken.balanceOf(owner.address);
      const finalTotalSupply = await movinToken.totalSupply();
      
      expect(finalOwnerBalance).to.equal(initialOwnerBalance - burnAmount);
      expect(finalTotalSupply).to.equal(initialSupply - burnAmount);
    });
    
    it("Should fail when burning more tokens than balance", async function () {
      const ownerBalance = await movinToken.balanceOf(owner.address);
      const burnAmount = ownerBalance + ethers.parseEther("1");
      
      await expect(movinToken.burn(burnAmount)).to.be.reverted;
    });
    
    it("Should allow burnFrom after approval", async function () {
      const transferAmount = ethers.parseEther("10000");
      const burnAmount = ethers.parseEther("5000");
      
      // Transfer some tokens to addr1
      await movinToken.transfer(addr1.address, transferAmount);
      
      // addr1 approves owner to spend tokens
      await movinToken.connect(addr1).approve(owner.address, burnAmount);
      
      // Check balances before burn
      const initialAddr1Balance = await movinToken.balanceOf(addr1.address);
      
      // Owner burns from addr1's balance
      await movinToken.burnFrom(addr1.address, burnAmount);
      
      // Check balances after burning
      const finalAddr1Balance = await movinToken.balanceOf(addr1.address);
      const finalTotalSupply = await movinToken.totalSupply();
      
      expect(finalAddr1Balance).to.equal(initialAddr1Balance - burnAmount);
      expect(finalTotalSupply).to.equal(initialSupply - burnAmount);
    });
    
    it("Should fail burnFrom without sufficient approval", async function () {
      const transferAmount = ethers.parseEther("10000");
      const approveAmount = ethers.parseEther("3000");
      const burnAmount = ethers.parseEther("5000");
      
      // Transfer some tokens to addr1
      await movinToken.transfer(addr1.address, transferAmount);
      
      // addr1 approves owner but for less than the burn amount
      await movinToken.connect(addr1).approve(owner.address, approveAmount);
      
      // Owner tries to burn more than approved from addr1's balance
      await expect(movinToken.burnFrom(addr1.address, burnAmount)).to.be.reverted;
    });
    
    it("Should emit Transfer event to zero address on burn", async function () {
      const burnAmount = ethers.parseEther("1000");
      
      await expect(movinToken.burn(burnAmount))
        .to.emit(movinToken, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, burnAmount);
    });
  });
}); 