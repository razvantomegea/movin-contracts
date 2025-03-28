import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { initializeContractsMoralis } from './contracts';

const MovinMoralisDashboard = () => {
  const [contracts, setContracts] = useState(null);
  const [account, setAccount] = useState('');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [userStakes, setUserStakes] = useState([]);
  const [isPremium, setIsPremium] = useState(false);
  const [pendingRewards, setPendingRewards] = useState({ steps: '0', mets: '0' });
  const [stakeAmount, setStakeAmount] = useState('');
  const [lockMonths, setLockMonths] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize Moralis and contracts
  useEffect(() => {
    const initContracts = async () => {
      try {
        setLoading(true);
        const contractInstances = await initializeContractsMoralis();
        setContracts(contractInstances);
        
        // Get connected account
        const accounts = await contractInstances.web3Provider.eth.getAccounts();
        setAccount(accounts[0]);
        
        // Load initial data
        await loadUserData(accounts[0], contractInstances);
      } catch (err) {
        setError(err.message);
        console.error('Error initializing contracts:', err);
      } finally {
        setLoading(false);
      }
    };

    initContracts();
  }, []);

  // Load user data from contracts
  const loadUserData = async (address, contractInstances) => {
    try {
      // Get token balance
      const balance = await contractInstances.helpers.getTokenBalance(address);
      setTokenBalance(ethers.utils.formatUnits(balance, 18));
      
      // Check premium status
      const premium = await contractInstances.helpers.getPremiumStatus(address);
      setIsPremium(premium);
      
      // Get pending rewards
      const rewards = await contractInstances.helpers.getPendingRewards();
      setPendingRewards({
        steps: ethers.utils.formatUnits(rewards.stepsReward, 18),
        mets: ethers.utils.formatUnits(rewards.metsReward, 18)
      });
      
      // Get stakes
      const stakes = await contractInstances.helpers.getUserStakes(address);
      setUserStakes(stakes.map(stake => ({
        amount: ethers.utils.formatUnits(stake.amount, 18),
        startTime: new Date(stake.startTime * 1000).toLocaleString(),
        lockDuration: stake.lockDuration / (60 * 60 * 24) + ' days',
        lastClaimed: new Date(stake.lastClaimed * 1000).toLocaleString()
      })));
    } catch (err) {
      setError(err.message);
      console.error('Error loading user data:', err);
    }
  };

  // Stake tokens
  const handleStake = async () => {
    if (!contracts || !stakeAmount) return;
    
    try {
      const amountWei = ethers.utils.parseUnits(stakeAmount, 18);
      
      // First approve the tokens
      await contracts.helpers.approveTokens(CONTRACT_ADDRESSES.MOVIN_EARN, amountWei);
      
      // Then stake them
      await contracts.helpers.stakeTokens(amountWei, lockMonths);
      
      // Reload data
      await loadUserData(account, contracts);
      setStakeAmount('');
    } catch (err) {
      setError(err.message);
      console.error('Error staking tokens:', err);
    }
  };

  // Claim rewards
  const handleClaimRewards = async () => {
    if (!contracts) return;
    
    try {
      await contracts.helpers.claimRewards();
      await loadUserData(account, contracts);
    } catch (err) {
      setError(err.message);
      console.error('Error claiming rewards:', err);
    }
  };

  // Record activity (for demo purposes)
  const recordActivity = async () => {
    if (!contracts) return;
    
    try {
      // Record 10,000 steps and 10 METs (for premium users)
      await contracts.helpers.recordActivity(10000, 10);
      await loadUserData(account, contracts);
    } catch (err) {
      setError(err.message);
      console.error('Error recording activity:', err);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="movin-dashboard">
      <h1>Movin Dashboard (Moralis Integration)</h1>
      
      {!account ? (
        <div>Please connect your wallet</div>
      ) : (
        <div>
          <div className="user-info">
            <p>Connected Account: {account}</p>
            <p>MVN Balance: {tokenBalance} MVN</p>
            <p>Premium Status: {isPremium ? 'Active' : 'Inactive'}</p>
          </div>
          
          <div className="rewards-section">
            <h2>Activity Rewards</h2>
            <p>Pending Steps Rewards: {pendingRewards.steps} MVN</p>
            <p>Pending METs Rewards: {pendingRewards.mets} MVN</p>
            <button onClick={handleClaimRewards}>Claim Rewards</button>
            <button onClick={recordActivity}>Record Activity (Demo)</button>
          </div>
          
          <div className="staking-section">
            <h2>Staking</h2>
            <div className="stake-form">
              <input
                type="text"
                placeholder="Amount to Stake"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
              />
              <select value={lockMonths} onChange={(e) => setLockMonths(Number(e.target.value))}>
                <option value={1}>1 Month</option>
                <option value={3}>3 Months</option>
                <option value={6}>6 Months</option>
                <option value={12}>12 Months</option>
                <option value={24}>24 Months</option>
              </select>
              <button onClick={handleStake}>Stake Tokens</button>
            </div>
            
            <h3>Your Stakes</h3>
            {userStakes.length === 0 ? (
              <p>No active stakes</p>
            ) : (
              <ul className="stakes-list">
                {userStakes.map((stake, index) => (
                  <li key={index} className="stake-item">
                    <p>Amount: {stake.amount} MVN</p>
                    <p>Started: {stake.startTime}</p>
                    <p>Lock Duration: {stake.lockDuration}</p>
                    <p>Last Claimed: {stake.lastClaimed}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MovinMoralisDashboard; 