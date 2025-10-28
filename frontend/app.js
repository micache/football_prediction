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

  if (!statusBox) {
    console.error("Status element not found in DOM; aborting app initialization.");
    return;
  }

  if (typeof window.ethers === "undefined") {
    statusBox.textContent = "Failed to load ethers.js. Check your network connection and refresh the page.";
    statusBox.classList.add("error");
    console.error("Ethers.js did not load. Ensure the CDN script is reachable and not blocked by the browser.");
    return;
  }

  const { ethers } = window;

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
  let isConnectingWallet = false;

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

  const initializeProvider = () => {
    requireWallet();
    if (!provider) {
      provider = new ethers.BrowserProvider(window.ethereum);
    }
    return provider;
  };

  const connectWallet = async () => {
    if (isConnectingWallet) {
      logStatus("Already requesting wallet access. Check MetaMask.");
      return;
    }
    try {
      isConnectingWallet = true;
      initializeProvider();
      logStatus("Requesting MetaMask connection...");
      console.info("Requesting MetaMask connection via eth_requestAccounts");
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts authorized");
      }
      currentAccount = ethers.getAddress(accounts[0]);
      signer = await provider.getSigner();
      await updateAccountDisplay();
      logStatus("Wallet connected. Load a token to continue.");
      console.info("MetaMask connected with account", currentAccount);
    } catch (error) {
      logStatus(`Failed to connect wallet: ${error.message}`, true);
      console.error("Wallet connection failed", error);
    }
    isConnectingWallet = false;
  };

  const handleWalletDisconnected = () => {
    currentAccount = undefined;
    signer = undefined;
    tokenContract = undefined;
    accountDisplay.textContent = "Not connected";
    networkDisplay.textContent = "";
    logStatus("Wallet disconnected", true);
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
      const allowance = await tokenContract.allowance(
        currentAccount,
        checksummedSpender
      );
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

  if (connectWalletBtn) {
    connectWalletBtn.addEventListener("click", connectWallet);
  }
  if (loadTokenBtn) {
    loadTokenBtn.addEventListener("click", loadToken);
  }
  if (checkAllowanceBtn) {
    checkAllowanceBtn.addEventListener("click", checkAllowance);
  }
  if (approveBtn) {
    approveBtn.addEventListener("click", approveSpender);
  }

  if (window.ethereum) {
    initializeProvider();

    window.ethereum.on("accountsChanged", async (accounts) => {
      if (!accounts || accounts.length === 0) {
        handleWalletDisconnected();
        return;
      }
      try {
        initializeProvider();
        currentAccount = ethers.getAddress(accounts[0]);
        signer = await provider.getSigner();
        await updateAccountDisplay();
        logStatus(
          "Account changed. Token and allowances may need to be reloaded."
        );
      } catch (error) {
        logStatus(`Failed to handle account change: ${error.message}`, true);
      }
    });

    window.ethereum.on("chainChanged", async () => {
      provider = undefined;
      try {
        initializeProvider();
        signer = currentAccount ? await provider.getSigner() : undefined;
        await updateAccountDisplay();
        logStatus(
          "Network changed. Token and allowances may need to be reloaded."
        );
      } catch (error) {
        logStatus(`Failed to handle network change: ${error.message}`, true);
      }
    });

    window.ethereum.on("disconnect", (error) => {
      console.warn("MetaMask disconnected", error);
      handleWalletDisconnected();
    });

    (async () => {
      try {
        const accounts = await provider.send("eth_accounts", []);
        if (accounts && accounts.length > 0) {
          currentAccount = ethers.getAddress(accounts[0]);
          signer = await provider.getSigner();
          await updateAccountDisplay();
          logStatus("Wallet already connected. Load a token to continue.");
        } else {
          logStatus("Click \"Connect Wallet\" to link MetaMask.");
        }
      } catch (error) {
        logStatus(`Unable to check wallet connection: ${error.message}`, true);
        console.error("Failed to check existing wallet connection", error);
      }
    })();
  } else {
    logStatus(
      "No Ethereum wallet detected. Install MetaMask or another compatible wallet.",
      true
    );
  }
})();
