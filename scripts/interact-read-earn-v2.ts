import { ethers } from "hardhat";
import { formatEther } from "ethers";
import { MOVIN_EARN_PROXY_ADDRESS } from "./contract-addresses";

// Import contract artifacts
import MOVINEarnV2Artifact from "../artifacts/contracts/MOVINEarnV2.sol/MOVINEarnV2.json";

// Define interface matching the contract structure
interface UserActivity {
  dailySteps: bigint;
  dailyMets: bigint;
  pendingStepsRewards: bigint;
  pendingMetsRewards: bigint;
  lastMidnightReset: bigint;
  lastRewardAccumulationTime: bigint;
  isPremium: boolean;
  hourlySteps: bigint;
  hourlyMets: bigint;
  lastHourlyReset: bigint;
}

interface Stake {
  amount: bigint;
  startTime: bigint;
  lockDuration: bigint;
  lastClaimed: bigint;
}

async function main() {
  console.log("=== MOVINEarnV2 Contract Reader ===");

  console.log(`📄 Connecting to MOVINEarnV2 at ${MOVIN_EARN_PROXY_ADDRESS}`);
  // Use contract instance with ABI
  const movinEarnV2 = new ethers.Contract(
    MOVIN_EARN_PROXY_ADDRESS,
    MOVINEarnV2Artifact.abi,
    ethers.provider
  );
  
  console.log("\n=== Contract Constants ===");
  try {
    const stepsThreshold = await movinEarnV2.STEPS_THRESHOLD();
    const metsThreshold = await movinEarnV2.METS_THRESHOLD();
    const maxDailySteps = await movinEarnV2.MAX_DAILY_STEPS();
    const maxDailyMets = await movinEarnV2.MAX_DAILY_METS();
    const maxHourlySteps = await movinEarnV2.MAX_HOURLY_STEPS();
    const maxHourlyMets = await movinEarnV2.MAX_HOURLY_METS();
    const referralBonusPercent = await movinEarnV2.REFERRAL_BONUS_PERCENT();
    const burnFeesPercent = await movinEarnV2.REWARDS_BURN_FEES_PERCENT();
    
    console.log(`🏃 Steps threshold: ${stepsThreshold}`);
    console.log(`🏃 METs threshold: ${metsThreshold}`);
    console.log(`📊 Max daily limits: ${maxDailySteps} steps, ${maxDailyMets} METs`);
    console.log(`📊 Max hourly limits: ${maxHourlySteps} steps, ${maxHourlyMets} METs`);
    console.log(`🤝 Referral bonus: ${referralBonusPercent}%`);
    console.log(`🔥 Burn fees: ${burnFeesPercent}%`);
  } catch (err) {
    const error = err as Error;
    console.log(`❌ Error getting contract constants: ${error.message}`);
  }
  
  // Get contract state variables
  console.log("\n=== Contract State ===");
  try {
    const baseStepsRate = await movinEarnV2.baseStepsRate();
    const baseMetsRate = await movinEarnV2.baseMetsRate();
    const rewardHalvingTimestamp = await movinEarnV2.rewardHalvingTimestamp();
    const halvingDate = new Date(Number(rewardHalvingTimestamp) * 1000);
    
    console.log(`💰 Base steps rate: ${formatEther(baseStepsRate)} MOVIN per 10,000 steps`);
    console.log(`💰 Base METs rate: ${formatEther(baseMetsRate)} MOVIN per 10 METs`);
    console.log(`📅 Next reward halving: ${halvingDate.toISOString()} (timestamp: ${rewardHalvingTimestamp})`);
  } catch (err) {
    const error = err as Error;
    console.log(`❌ Error getting contract state: ${error.message}`);
  }

  
  console.log("\n=== Script completed ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 