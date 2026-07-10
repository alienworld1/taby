// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {TabySettlement} from "../src/TabySettlement.sol";

contract DeployTabySettlement is Script {
    address public constant ARBITRUM_SEPOLIA_USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

    function run() public returns (TabySettlement settlement) {
        vm.startBroadcast();
        settlement = new TabySettlement(ARBITRUM_SEPOLIA_USDC);
        vm.stopBroadcast();
    }
}
