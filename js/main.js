const contractAddress = '0xf795048ba9c0bbb2d8d2e0d06fb0c7f0df79e966'; // rinkeby
const chainId = '4'; // rinkeby

window.addEventListener('DOMContentLoaded', async () => {
  if (!window.ethereum.selectedAddress) {
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
      }
      await switchNetwork();
      const res = await getWalletAddress();
      if (res) btn.addClass('hidden');
    });
  } else {
    await updateMintStatus();
    let _i = setInterval(updateMintStatus, 10000);
    $('#mintButton').click(async function (){
      $('#mintForm').addClass('hidden');
      clearInterval(_i);
      await _mintPublic();
    });
  }
  window.ethereum.on('accountsChanged', function (accounts) {
    window.location.href = '';
  })
});

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
  await switchNetwork();
  const w3 = new Web3(Web3.givenProvider || "http://127.0.0.1:7545");
  const walletAddress = await getWalletAddress();
  const walletShort = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
  const contract = new w3.eth.Contract(contractABI, contractAddress, {from: walletAddress});
  const currentSupply = await contract.methods.totalSupply().call();
  const maxSupply = await contract.methods.maxSupply().call();
  const maxMints = await contract.methods.maxMint().call();
  const mintsAvailable = await contract.methods.getMintAmount().call();
  const mintPhase = await contract.methods.getMintPhase().call();
  const mintingIsActive = await contract.methods.mintingIsActive().call();
  const timeUntilNext = await contract.methods.getTimeUntilNextPhase().call();
  const mintedOut = currentSupply == maxSupply;
  if (mintedOut) {
    $('#mintMessage').html(`That's all folks, supply is minted out! Check secondary markets to purchase an NFT-isse.<br><br><a href="https://opensea.io/collection/nftisse" target=_blank>Opensea</a>`);
    return false;
  }
  if (!mintingIsActive) {
    $('#mintMessage').html(`Minting is not active yet! Check back later.<br><br>Wallet ${walletShort} is slated to mint ${mintsAvailable} tokens.<div style="margin-top: 8px"></div><h2><b>${currentSupply} / ${maxSupply} minted</b></h2><div style="margin-top: 8px"></div>`);
  } else {
    if (mintPhase == 0) {
      if (mintsAvailable > 0) {
        $('#mintMessage').html(`Minting for R. Mutt holders is live!<br><br>Wallet ${walletShort} can mint ${mintsAvailable} tokens.<div style="margin-top: 8px"></div><h2><b>${currentSupply} / ${maxSupply} minted</b></h2><div style="margin-top: 8px"></div>`);
        $('#mintForm').removeClass('hidden');
      } else {
        const later = new Date(Number(new Date().getTime()) + (Number(timeUntilNext) * 1000)).getTime();
        const now = new Date().getTime();
        const distance = later - now;
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
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
      // public can mint up to 3
    }
  }
  $('#loading').addClass('hidden');
}

async function _mintPublic() {
  try {
    await mintPublic();
  } catch(e) {
    $('#mintMessage').html(`${e.message} - try again`);
    await updateMintStatus();
    return false;
  }
}

async function mintPublic() {
  let etherscan_uri = 'etherscan.io';
  let opensea_uri = 'opensea.io';
  if (window.ethereum.chainId == "0x4") {
    etherscan_uri = 'rinkeby.etherscan.io';
    opensea_uri = 'testnets.opensea.io';
  }
  let res;
  let gasLimit;
  await switchNetwork();
  const w3 = new Web3(Web3.givenProvider || "http://127.0.0.1:7545");
  const walletAddress = await getWalletAddress();
  const walletShort = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
  const gasPrice = await w3.eth.getGasPrice();
  let amountToMint = $('#numberOfTokens').val();
  if (amountToMint <= 0 || isNaN(amountToMint)) {
    amountToMint = 1;
    $('#numberOfTokens').val(amountToMint);
  }
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
  });
  // Show loading icon
  $('#mintForm').addClass('hidden');
  $('#loading').removeClass('hidden');
  $('#mintMessage').html(`Attempting to mint ${amountToMint} tokens for ${Number(w3.utils.fromWei((gasLimit * gasPrice).toString())).toFixed(4)} Ξ to wallet ${walletShort}`);
  res = await contract.methods.mintPublic(amountToMint).send({
    from: walletAddress,
    gasPrice: gasPrice,
    gas: gasLimit
  });
  $('#loading').addClass('hidden');
  if (res.status) {
    $('#mintMessage').html(`Success! Head to <a target=_blank href="https://${opensea_uri}/account?search[resultModel]=ASSETS&search[sortBy]=LAST_TRANSFER_DATE&search[sortAscending]=false">OpenSea</a> to see your NFTs!<br><br><a target=_blank href="https://${etherscan_uri}/tx/${res.transactionHash}">Etherscan</a>`);
  } else {
    $('#mintMessage').html(`Failed. ${res}`);
  }
}
