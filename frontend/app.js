(() => {
  const connectWalletBtn = document.getElementById("connectWallet");
  const accountDisplay = document.getElementById("accountDisplay");
  const networkDisplay = document.getElementById("networkDisplay");
  const loadTokenBtn = document.getElementById("loadToken");
  const tokenAddressInput = document.getElementById("tokenAddress");
  const tokenInfo = document.getElementById("tokenInfo");
  const recipientAddressInput = document.getElementById("recipientAddress");
  const transferAmountInput = document.getElementById("transferAmount");
  const transferBtn = document.getElementById("transferBtn");
  const spenderAddressInput = document.getElementById("spenderAddress");
  const approveAmountInput = document.getElementById("approveAmount");
  const checkAllowanceBtn = document.getElementById("checkAllowance");
  const approveBtn = document.getElementById("approve");
  const allowanceInfo = document.getElementById("allowanceInfo");
  const refreshHistoryBtn = document.getElementById("refreshHistory");
  const transferHistory = document.getElementById("transferHistory");
  const historyStatus = document.getElementById("historyStatus");
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
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
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
    if (!provider || !currentAccount) return;
    try {
      const network = await provider.getNetwork();
      networkDisplay.textContent = `Connected to ${network.name} (chain ${network.chainId})`;
      accountDisplay.textContent = currentAccount;
    } catch (error) {
      console.error("Failed to update account display:", error);
      networkDisplay.textContent = "Network info unavailable";
      accountDisplay.textContent = currentAccount || "Not connected";
    }
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
      requireWallet();
      initializeProvider();
      logStatus("Requesting MetaMask connection...");
      console.info("Requesting MetaMask connection via eth_requestAccounts");
      
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
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
    } finally {
      isConnectingWallet = false;
    }
  };

  const handleWalletDisconnected = () => {
    currentAccount = undefined;
    signer = undefined;
    tokenContract = undefined;
    accountDisplay.textContent = "Not connected";
    networkDisplay.textContent = "";
    tokenInfo.textContent = "";
    allowanceInfo.textContent = "";
    transferHistory.innerHTML = '<p class="muted">Connect wallet to see transfer history.</p>';
    logStatus("Wallet disconnected. Click 'Connect Wallet' to reconnect.", true);
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
      
      logStatus("Loading token information...");
      
      const [symbol, decimals, balance] = await Promise.all([
        tokenContract.symbol().catch(() => "TOKEN"),
        tokenContract.decimals(),
        tokenContract.balanceOf(currentAccount)
      ]);
      
      tokenMeta = { symbol: symbol || "TOKEN", decimals: Number(decimals) };
      const formattedBalance = ethers.formatUnits(balance, tokenMeta.decimals);
      tokenInfo.textContent = `Loaded ${tokenMeta.symbol} token. Your balance: ${formattedBalance}`;
      logStatus(`Token loaded successfully. You can now transfer or approve ${tokenMeta.symbol}.`);
      
      // Auto-load transfer history
      await loadTransferHistory();
    } catch (error) {
      tokenContract = undefined;
      logStatus(`Unable to load token: ${error.message}`, true);
      tokenInfo.textContent = "";
      console.error("Token loading error:", error);
    }
  };

  const transferTokens = async () => {
    if (!tokenContract) {
      logStatus("Load a token first.", true);
      return;
    }
    try {
      const recipient = recipientAddressInput.value.trim();
      if (!recipient) {
        throw new Error("Enter a recipient address");
      }
      const amountInput = transferAmountInput.value.trim();
      if (!amountInput || Number(amountInput) <= 0) {
        throw new Error("Enter a valid amount greater than 0");
      }
      
      const checksummedRecipient = ethers.getAddress(recipient);
      const parsedAmount = ethers.parseUnits(amountInput, tokenMeta.decimals);
      
      logStatus(`Sending transfer transaction for ${amountInput} ${tokenMeta.symbol}...`);
      const tx = await tokenContract.transfer(checksummedRecipient, parsedAmount);
      logStatus(`Transaction submitted (${tx.hash}). Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        throw new Error("Transaction failed");
      }
      
      logStatus(`Transfer successful in block ${receipt.blockNumber}!`);
      
      // Update balance
      const balance = await tokenContract.balanceOf(currentAccount);
      const formattedBalance = ethers.formatUnits(balance, tokenMeta.decimals);
      tokenInfo.textContent = `Loaded ${tokenMeta.symbol} token. Your balance: ${formattedBalance}`;
      
      // Clear input
      transferAmountInput.value = "";
      
      // Refresh history
      await loadTransferHistory();
    } catch (error) {
      logStatus(`Transfer failed: ${error.message}`, true);
      console.error("Transfer error:", error);
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
      
      logStatus("Checking allowance...");
      
      const allowance = await tokenContract.allowance(
        currentAccount,
        checksummedSpender
      );
      const formattedAllowance = ethers.formatUnits(allowance, tokenMeta.decimals);
      allowanceInfo.textContent = `Current allowance for ${checksummedSpender}: ${formattedAllowance} ${tokenMeta.symbol}`;
      logStatus("Allowance fetched successfully.");
    } catch (error) {
      logStatus(`Failed to fetch allowance: ${error.message}`, true);
      console.error("Allowance check error:", error);
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
      console.error("Approval error:", error);
    }
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

  const loadTransferHistory = async () => {
    if (!tokenContract || !currentAccount) {
      transferHistory.innerHTML = '<p class="muted">Load a token to see transfer history.</p>';
      return;
    }
    
    try {
      historyStatus.textContent = "Loading history...";
      
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      
      // Query last 10000 blocks (adjust based on your needs)
      const fromBlock = Math.max(0, currentBlock - 10000);
      
      // Create filters for transfers involving the current account
      const sentFilter = tokenContract.filters.Transfer(currentAccount, null);
      const receivedFilter = tokenContract.filters.Transfer(null, currentAccount);
      
      // Query events
      const [sentEvents, receivedEvents] = await Promise.all([
        tokenContract.queryFilter(sentFilter, fromBlock, currentBlock),
        tokenContract.queryFilter(receivedFilter, fromBlock, currentBlock)
      ]);
      
      // Combine and sort by block number (most recent first)
      const allEvents = [...sentEvents, ...receivedEvents]
        .sort((a, b) => b.blockNumber - a.blockNumber);
      
      if (allEvents.length === 0) {
        transferHistory.innerHTML = '<p class="muted">No transfer history found for this token.</p>';
        historyStatus.textContent = "";
        return;
      }
      
      // Build history HTML
      let historyHTML = '<div class="history-list">';
      
      for (const event of allEvents) {
        const block = await event.getBlock();
        const isSent = event.args.from.toLowerCase() === currentAccount.toLowerCase();
        const amount = ethers.formatUnits(event.args.value, tokenMeta.decimals);
        const otherParty = isSent ? event.args.to : event.args.from;
        
        historyHTML += `
          <div class="history-item ${isSent ? 'sent' : 'received'}">
            <div class="history-header">
              <span class="history-type">${isSent ? '📤 Sent' : '📥 Received'}</span>
              <span class="history-amount">${amount} ${tokenMeta.symbol}</span>
            </div>
            <div class="history-details">
              <div>${isSent ? 'To' : 'From'}: <code>${formatAddress(otherParty)}</code></div>
              <div>Block: ${event.blockNumber}</div>
              <div>Time: ${formatTimestamp(block.timestamp)}</div>
              <div>Tx: <a href="#" onclick="navigator.clipboard.writeText('${event.transactionHash}'); return false;" title="Click to copy">${formatAddress(event.transactionHash)}</a></div>
            </div>
          </div>
        `;
      }
      
      historyHTML += '</div>';
      transferHistory.innerHTML = historyHTML;
      historyStatus.textContent = `${allEvents.length} transaction(s) found`;
      
    } catch (error) {
      console.error("Failed to load transfer history:", error);
      transferHistory.innerHTML = '<p class="muted error">Failed to load transfer history. Try again.</p>';
      historyStatus.textContent = "";
    }
  };

  // Event listeners
  if (connectWalletBtn) {
    connectWalletBtn.addEventListener("click", connectWallet);
  }
  if (loadTokenBtn) {
    loadTokenBtn.addEventListener("click", loadToken);
  }
  if (transferBtn) {
    transferBtn.addEventListener("click", transferTokens);
  }
  if (checkAllowanceBtn) {
    checkAllowanceBtn.addEventListener("click", checkAllowance);
  }
  if (approveBtn) {
    approveBtn.addEventListener("click", approveSpender);
  }
  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", loadTransferHistory);
  }

  // MetaMask event handlers
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", async (accounts) => {
      if (!accounts || accounts.length === 0) {
        handleWalletDisconnected();
        return;
      }
      try {
        provider = new ethers.BrowserProvider(window.ethereum);
        currentAccount = ethers.getAddress(accounts[0]);
        signer = await provider.getSigner();
        await updateAccountDisplay();
        logStatus("Account changed. Token and history may need to be reloaded.");
        
        // Reload history if token is loaded
        if (tokenContract) {
          await loadTransferHistory();
        }
      } catch (error) {
        logStatus(`Failed to handle account change: ${error.message}`, true);
        console.error("Account change error:", error);
      }
    });

    window.ethereum.on("chainChanged", () => {
      window.location.reload();
    });

    window.ethereum.on("disconnect", (error) => {
      console.warn("MetaMask disconnected", error);
      handleWalletDisconnected();
    });

    // Check if already connected
    (async () => {
      try {
        if (!window.ethereum) {
          logStatus("No Ethereum wallet detected. Install MetaMask.", true);
          return;
        }

        provider = new ethers.BrowserProvider(window.ethereum);
        
        const accounts = await window.ethereum.request({ 
          method: 'eth_accounts' 
        });
        
        if (accounts && accounts.length > 0) {
          currentAccount = ethers.getAddress(accounts[0]);
          signer = await provider.getSigner();
          await updateAccountDisplay();
          logStatus("Wallet already connected. Load a token to continue.");
          console.info("Already connected to account:", currentAccount);
        } else {
          logStatus("Click 'Connect Wallet' to link MetaMask.");
        }
      } catch (error) {
        logStatus("Click 'Connect Wallet' to get started.");
        console.error("Failed to check existing wallet connection:", error);
      }
    })();
  } else {
    logStatus(
      "No Ethereum wallet detected. Install MetaMask or another compatible wallet.",
      true
    );
  }
})();