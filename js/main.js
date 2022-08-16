const contractAddress = '0x207ad995e5014441b81ca6c70709d7e738203830'; // mainnet
const chainId = '1'; // mainnet
const w3 = new Web3(Web3.givenProvider || "http://127.0.0.1:7545");

window.addEventListener('DOMContentLoaded', async () => {
  if (!window.ethereum || !window.ethereum.selectedAddress || !window.ethereum.isMetaMask) {
    const btn = $('#connectButton');
    btn.removeClass('hidden');
    btn.click(async function (){
      // Offer to install MetaMask if it's not installed nor do we detect a replacement such as Coinbase wallet
      const onboarding = new MetaMaskOnboarding();
      if (!MetaMaskOnboarding.isMetaMaskInstalled() && !window.ethereum) {
        alert('This site requires a browser wallet addon, such as Coinbase wallet or MetaMask. Redirecting you to a page to download MetaMask.');
        await onboarding.startOnboarding();
      } else {
        await onboarding.stopOnboarding();
        const res = await getWalletAddress();
        if (res) btn.addClass('hidden');
        handleEthereum();
      }
    });
  } else {
    handleEthereum()
  }
});

async function handleEthereum() {
  // refresh page if changing wallets
  window.ethereum.on('accountsChanged', async function (accounts) {
    // window.location.href = '';
    handleEthereum();
  });
  // unhide refresh link
  $('#refresh').removeClass('hidden');
  // update mint message/status when clicking refresh
  $('#refresh').click(async function () {
    await updateMintStatus();
  });
  // update mint message/status now and every 10 seconds
  await updateMintStatus();
  let _i = setInterval(updateMintStatus, 10000);
  // Calculate mint values on form input
  let timeout = null;
  $('input').on('input', function(){
    clearTimeout(timeout);
    timeout = setTimeout(function () {
      const mintPriceEther = $('#mintPriceEther').val();
      const numberOfTokens = $('#numberOfTokens').val();
      if (isNaN(mintPriceEther) || isNaN(numberOfTokens)) return false;
      const mintPriceWei = w3.utils.toWei(mintPriceEther);
      const mintValueWei = mintPriceWei * numberOfTokens;
      const mintValueEther = w3.utils.fromWei(mintValueWei.toString());
      $('#totalValue').html(`(~${mintValueEther} Ξ)`)
    });
  });
  // hide form and stop refreshing message/status
  $('.mintButton').on('click', async function (){
    const mintPriceEther = $('#mintPriceEther').val();
    $('#mintForm').addClass('hidden');
    clearInterval(_i);
    await _mintPublic(mintPriceEther);
  });
}

async function switchNetwork(){
  // don't do this if no metamask (errors on coinbase wallet)
  if (!MetaMaskOnboarding.isMetaMaskInstalled()) {
    return false;
  }
  await ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: `0x${chainId}` }],
  });
}

async function getWalletAddress() {
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  });
  const account = accounts[0];
  return account;
}

async function updateMintStatus() {
  $('#loading').removeClass('hidden');
  const walletAddress = await getWalletAddress();
  const walletShort = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
  const contract = new w3.eth.Contract(contractABI, contractAddress, {from: walletAddress});
  const currentSupply = await contract.methods.totalSupply().call();
  const maxSupply = await contract.methods.maxSupply().call();
  const maxMints = await contract.methods.maxMint().call();
  const maxWallet = await contract.methods.maxWallet().call();
  const mintsAvailable = await contract.methods.getMintAmount().call();
  const mintPhase = await contract.methods.getMintPhase().call();
  const mintingIsActive = await contract.methods.mintingIsActive().call();
  const timeUntilNext = await contract.methods.getTimeUntilNextPhase().call();
  const balance = await contract.methods.balanceOf(walletAddress).call();
  const mintedOut = currentSupply == maxSupply;
  if (mintedOut) {
    $('#mintMessage').html(`That's all folks, supply is minted out! Check secondary markets to purchase an NFT-isse.<br><br><a href="https://opensea.io/collection/nftisse" target=_blank>Opensea</a>`);
    return false;
  }
  if (!mintingIsActive) {
    $('#mintMessage').html(`Minting is not active yet! Check back later.<br><br>Wallet <b>${walletShort}</b> is slated to mint ${mintsAvailable} tokens.<div style="margin-top: 8px"></div><h2><b>${currentSupply} / ${maxSupply} minted</b></h2><div style="margin-top: 8px"></div>`);
  } else {
    if (mintPhase == 0) {
      if (mintsAvailable > 0) {
        $('#mintMessage').html(`Minting for R. Mutt holders is live!<br><br>Wallet <b>${walletShort}</b> can mint ${mintsAvailable} tokens.<div style="margin-top: 8px"></div><h2><b>${currentSupply} / ${maxSupply} minted</b></h2><div style="margin-top: 8px"></div>`);
        $('#mintForm').removeClass('hidden');
      } else {
        const later = new Date(Number(new Date().getTime()) + (Number(timeUntilNext) * 1000)).getTime();
        const now = new Date().getTime();
        const distance = later - now;
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        let seconds = Math.floor((distance % (1000 * 60)) / 1000);
        if (seconds >= 30) {
          seconds = `>30`;
        } else {
          seconds = `<30`;
        }
        const countdown = `<b>${hours} hours, ${minutes} minutes, and ${seconds} seconds`;
        $('#mintMessage').html(`Minting is live for R. Mutt holders, but you are not elligible to mint right now! <br><br>Public minting opens in ${countdown} <div style="margin-top: 8px"></div><h2><b>${currentSupply} / ${maxSupply} minted</b></h2><div style="margin-top: 8px"></div>`);
        if (distance <= 0) {
          await updateMintStatus();
        }
      }
    } else {
      $('#mintMessage').html(`Minting for public is live!<br><br>${maxMints} per tx, ${maxWallet} per wallet. Wallet <b>${walletShort}</b> can mint ${mintsAvailable} tokens.<div style="margin-top: 8px"></div><h2><b>${currentSupply} / ${maxSupply} minted</b></h2><div style="margin-top: 8px"></div>`);
      if (mintsAvailable) $('#mintForm').removeClass('hidden');
    }
  }
  $('#loading').addClass('hidden');
}

async function _mintPublic(mintPrice) {
  try {
    await mintPublic(mintPrice);
  } catch(e) {
    $('#mintMessage').html(`${e.message} - refresh and try again`);
    return false;
  }
}

async function mintPublic(mintPrice) {
  let etherscan_uri = 'etherscan.io';
  let opensea_uri = 'opensea.io';
  if (window.ethereum.chainId == "0x4") {
    etherscan_uri = 'rinkeby.etherscan.io';
    opensea_uri = 'testnets.opensea.io';
  }
  let res;
  let gasLimit;
  let estimatedGas;
  const walletAddress = await getWalletAddress();
  const walletShort = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
  const gasPrice = await w3.eth.getGasPrice();
  let amountToMint = $('#numberOfTokens').val();
  if (amountToMint <= 0 || isNaN(amountToMint)) {
    amountToMint = 1;
    $('#numberOfTokens').val(amountToMint);
  }
  // Figure out value to send if user opting to send ETH
  const mintPriceWei = w3.utils.toWei(mintPrice);
  const mintValueWei = mintPriceWei * amountToMint;
  const mintValueEther = w3.utils.fromWei(mintValueWei.toString());
  // Define the contract we want to use
  const contract = new w3.eth.Contract(contractABI, contractAddress, {from: walletAddress});
  // Fail if sales are paused
  const mintingIsActive = await contract.methods.mintingIsActive().call();
  if (!mintingIsActive) {
    $('#mintMessage').html(`Sales are currently paused on this contract. Try again later.`);
    return false;
  }
  // Fail if requested amount would exceed supply
  let currentSupply = await contract.methods.totalSupply().call();
  let maxSupply = await contract.methods.maxSupply().call();
  if (Number(currentSupply) + Number(amountToMint) > Number(maxSupply)) {
    $('#mintMessage').html(`Requesting ${amountToMint} would exceed the maximum token supply of ${maxSupply}. Current supply is ${currentSupply}, so try minting ${maxSupply - currentSupply}.`)
    return false;
  }
  // Estimate gas limit
  await contract.methods.mintPublic(amountToMint).estimateGas({from: walletAddress}, function(err, gas){
    gasLimit = gas;
    estimatedGas = gas;
  });
  if (amountToMint > 1) {
    gasLimit = 2000000;
  } else {
    gasLimit = 1000000;
  }
  // Show loading icon
  $('#mintForm').addClass('hidden');
  $('#loading').removeClass('hidden');
  $('#mintMessage').html(`Attempting to mint ${amountToMint} tokens for ${Number(w3.utils.fromWei((gasLimit * gasPrice + mintValueWei).toString())).toFixed(5)} Ξ to wallet <b>${walletShort}</b>`);
  console.log(`Estimated Gas: ${estimatedGas}\nGasPrice: ${gasPrice}`);
  res = await contract.methods.mintPublic(amountToMint).send({
    from: walletAddress,
    gasPrice: gasPrice,
    gas: gasLimit,
    value: mintValueWei
  });
  $('#loading').addClass('hidden');
  if (res.status) {
    $('#mintMessage').html(`Success! Head to <a target=_blank href="https://${opensea_uri}/account?search[resultModel]=ASSETS&search[sortBy]=LAST_TRANSFER_DATE&search[sortAscending]=false">OpenSea</a> to see your NFTs!<br><br><a target=_blank href="https://${etherscan_uri}/tx/${res.transactionHash}">Etherscan</a>`);
  } else {
    // $('#mintMessage').html(`Failed. ${res}`);
    throw new Error(`Transaction failed: ${res}`)
  }
}
