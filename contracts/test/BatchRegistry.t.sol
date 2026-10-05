// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {BatchRegistry} from "../src/BatchRegistry.sol";

/// TC-082 (TKT-24, TSK-24.2): only the operator appends; each append stores the entry hash at its seq
/// and emits EntryAnchored; an existing seq cannot be overwritten; reads return what was written.
contract BatchRegistryTest is Test {
    BatchRegistry internal registry;
    address internal operator = makeAddr("operator");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant H1 = keccak256("entry 1");
    bytes32 internal constant H2 = keccak256("entry 2");

    event EntryAnchored(uint64 indexed seq, bytes32 entryHash);

    function setUp() public {
        registry = new BatchRegistry(operator);
    }

    function test_TC082_StartsEmptyAtSeqOne() public view {
        assertEq(registry.operator(), operator);
        assertEq(registry.nextSeq(), 1);
        assertEq(registry.entryHash(1), bytes32(0));
    }

    function test_TC082_NonOperatorReverts() public {
        vm.prank(stranger);
        vm.expectRevert(BatchRegistry.NotOperator.selector);
        registry.append(1, H1);
        assertEq(registry.nextSeq(), 1);
    }

    function test_TC082_OutOfOrderSeqReverts() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BatchRegistry.OutOfOrder.selector, uint64(1), uint64(2)));
        registry.append(2, H2);
        assertEq(registry.entryHash(2), bytes32(0));
    }

    function test_TC082_ReappendingAnExistingSeqReverts() public {
        vm.startPrank(operator);
        registry.append(1, H1);
        vm.expectRevert(abi.encodeWithSelector(BatchRegistry.OutOfOrder.selector, uint64(2), uint64(1)));
        registry.append(1, H2);
        vm.stopPrank();
        assertEq(registry.entryHash(1), H1, "seq 1 is never overwritten");
    }

    function test_TC082_ReadBackEqualsWritten() public {
        vm.startPrank(operator);
        registry.append(1, H1);
        registry.append(2, H2);
        vm.stopPrank();
        assertEq(registry.entryHash(1), H1);
        assertEq(registry.entryHash(2), H2);
        assertEq(registry.entryHash(3), bytes32(0));
        assertEq(registry.nextSeq(), 3);
    }

    function test_TC082_EmitsEntryAnchored() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit EntryAnchored(1, H1);
        vm.prank(operator);
        registry.append(1, H1);
    }

    function test_ZeroHashReverts() public {
        vm.prank(operator);
        vm.expectRevert(BatchRegistry.ZeroHash.selector);
        registry.append(1, bytes32(0));
    }

    function test_ZeroOperatorReverts() public {
        vm.expectRevert(BatchRegistry.ZeroOperator.selector);
        new BatchRegistry(address(0));
    }

    function testFuzz_TC082_AppendsInStrictOrder(bytes32[8] calldata hashes) public {
        vm.startPrank(operator);
        for (uint64 i = 0; i < hashes.length; i++) {
            bytes32 h = hashes[i] == bytes32(0) ? bytes32(uint256(i) + 1) : hashes[i];
            registry.append(i + 1, h);
            assertEq(registry.entryHash(i + 1), h);
        }
        vm.stopPrank();
        assertEq(registry.nextSeq(), hashes.length + 1);
    }
}
