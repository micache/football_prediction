// scripts/deploy.js
require("dotenv").config();        // if you use environment variables
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  const initialSupply = 1000000;   // ← define your initial supply here

  const Token = await ethers.getContractFactory("MyToken");
  const token = await Token.deploy(initialSupply);

  // Wait for deployment (ethers v6 syntax)
  await token.waitForDeployment();

  // Get the deployed address
  const deployedAddress = await token.getAddress();
  console.log("MyToken deployed to:", deployedAddress);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
