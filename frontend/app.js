(() => {
  const connectWalletBtn = document.getElementById("connectWallet");
  const accountDisplay = document.getElementById("accountDisplay");
  const networkDisplay = document.getElementById("networkDisplay");
  const loadTokenBtn = document.getElementById("loadToken");
  const tokenAddressInput = document.getElementById("tokenAddress");
  const tokenInfo = document.getElementById("tokenInfo");
  const spenderAddressInput = document.getElementById("spenderAddress");
  const approveAmountInput = document.getElementById("approveAmount");
  const checkAllowanceBtn = document.getElementById("checkAllowance");
  const approveBtn = document.getElementById("approve");
  const allowanceInfo = document.getElementById("allowanceInfo");
  const statusBox = document.getElementById("status");

  const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
  ];

  let provider;
  let signer;
  let currentAccount;
  let tokenContract;
  let tokenMeta = { symbol: "", decimals: 18 };

  const logStatus = (message, isError = false) => {
    statusBox.textContent = message;
    statusBox.classList.toggle("error", isError);
    statusBox.classList.toggle("muted", false);
  };

  const requireWallet = () => {
    if (!window.ethereum) {
      logStatus(
        "No Ethereum wallet detected. Install MetaMask or another compatible wallet.",
        true
      );
      throw new Error("Wallet not available");
    }
  };

  const updateAccountDisplay = async () => {
    if (!provider) return;
    const network = await provider.getNetwork();
    networkDisplay.textContent = `Connected to ${network.name} (chain ${network.chainId})`;
    accountDisplay.textContent = currentAccount;
  };

  const connectWallet = async () => {
    try {
      requireWallet();
      provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts authorized");
      }
      currentAccount = ethers.getAddress(accounts[0]);
      signer = await provider.getSigner();
      await updateAccountDisplay();
      logStatus("Wallet connected. Load a token to continue.");
    } catch (error) {
      logStatus(`Failed to connect wallet: ${error.message}`, true);
    }
  };

  const loadToken = async () => {
    if (!signer) {
      logStatus("Connect your wallet first.", true);
      return;
    }
    try {
      const address = tokenAddressInput.value.trim();
      if (!address) {
        throw new Error("Enter a token contract address");
      }
      const checksummed = ethers.getAddress(address);
      tokenContract = new ethers.Contract(checksummed, ERC20_ABI, signer);
      const [symbol, decimals, balance] = await Promise.all([
        tokenContract.symbol().catch(() => ""),
        tokenContract.decimals(),
        tokenContract.balanceOf(currentAccount)
      ]);
      tokenMeta = { symbol: symbol || "TOKEN", decimals: Number(decimals) };
      const formattedBalance = ethers.formatUnits(balance, tokenMeta.decimals);
      tokenInfo.textContent = `Loaded ${tokenMeta.symbol} token. Your balance: ${formattedBalance}`;
      logStatus(`Token loaded. You can now approve a spender for ${tokenMeta.symbol}.`);
    } catch (error) {
      tokenContract = undefined;
      logStatus(`Unable to load token: ${error.message}`, true);
      tokenInfo.textContent = "";
    }
  };

  const checkAllowance = async () => {
    if (!tokenContract) {
      logStatus("Load a token first.", true);
      return;
    }
    try {
      const spender = spenderAddressInput.value.trim();
      if (!spender) {
        throw new Error("Enter a spender address");
      }
      const checksummedSpender = ethers.getAddress(spender);
      const allowance = await tokenContract.allowance(currentAccount, checksummedSpender);
      const formattedAllowance = ethers.formatUnits(allowance, tokenMeta.decimals);
      allowanceInfo.textContent = `Current allowance for ${checksummedSpender}: ${formattedAllowance} ${tokenMeta.symbol}`;
      logStatus("Allowance fetched successfully.");
    } catch (error) {
      logStatus(`Failed to fetch allowance: ${error.message}`, true);
    }
  };

  const approveSpender = async () => {
    if (!tokenContract) {
      logStatus("Load a token first.", true);
      return;
    }
    try {
      const spender = spenderAddressInput.value.trim();
      if (!spender) {
        throw new Error("Enter a spender address");
      }
      const amountInput = approveAmountInput.value.trim();
      if (!amountInput || Number(amountInput) < 0) {
        throw new Error("Enter a valid amount");
      }
      const checksummedSpender = ethers.getAddress(spender);
      const parsedAmount = ethers.parseUnits(amountInput, tokenMeta.decimals);
      logStatus(`Sending approve transaction for ${amountInput} ${tokenMeta.symbol}...`);
      const tx = await tokenContract.approve(checksummedSpender, parsedAmount);
      logStatus(`Transaction submitted (${tx.hash}). Waiting for confirmation...`);
      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        throw new Error("Transaction failed");
      }
      logStatus(`Approval successful in block ${receipt.blockNumber}.`);
      await checkAllowance();
    } catch (error) {
      logStatus(`Approval failed: ${error.message}`, true);
    }
  };

  connectWalletBtn?.addEventListener("click", connectWallet);
  loadTokenBtn?.addEventListener("click", loadToken);
  checkAllowanceBtn?.addEventListener("click", checkAllowance);
  approveBtn?.addEventListener("click", approveSpender);

  if (window.ethereum) {
    window.ethereum.on("accountsChanged", async (accounts) => {
      if (!accounts || accounts.length === 0) {
        currentAccount = undefined;
        accountDisplay.textContent = "Not connected";
        logStatus("Wallet disconnected", true);
        return;
      }
      currentAccount = ethers.getAddress(accounts[0]);
      signer = await provider.getSigner();
      await updateAccountDisplay();
      logStatus("Account changed. Token and allowances may need to be reloaded.");
    });

    window.ethereum.on("chainChanged", async () => {
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = currentAccount ? await provider.getSigner() : undefined;
      await updateAccountDisplay();
      logStatus("Network changed. Token and allowances may need to be reloaded.");
    });
  }
})();
