// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script} from "forge-std/Script.sol";
import {BatchRegistry} from "../src/BatchRegistry.sol";

/// Deploys BatchRegistry with the operator as both deployer and operator (TSK-24.3). Run through
/// `pnpm contracts:deploy` (scripts/evm-deploy.ts), which generates the operator key, funds it on local
/// Anvil only, passes the key to this process in UDGAM_DEPLOY_OPERATOR_KEY (never on the command line)
/// and writes DATA_DIR/evm/deployment.json.
contract Deploy is Script {
    function run() external returns (BatchRegistry registry) {
        uint256 key = vm.envUint("UDGAM_DEPLOY_OPERATOR_KEY");
        vm.startBroadcast(key);
        registry = new BatchRegistry(vm.addr(key));
        vm.stopBroadcast();
    }
}
