// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {MockINR} from "../src/MockINR.sol";

/// TSK-25.1 (TKT-25): the mock INR token is a plain ERC-20 with 2 decimals (paise). Only the operator
/// mints; transfer, approve and transferFrom behave like ERC-20.
contract MockINRTest is Test {
    MockINR internal token;
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setUp() public {
        token = new MockINR(operator);
    }

    function test_DecimalsArePaise() public view {
        assertEq(token.decimals(), 2);
        assertEq(token.symbol(), "mINR");
        assertEq(token.name(), "Mock INR");
        assertEq(token.totalSupply(), 0);
        assertEq(token.operator(), operator);
    }

    function test_OnlyOperatorMints() public {
        vm.prank(alice);
        vm.expectRevert(MockINR.NotOperator.selector);
        token.mint(alice, 100);
        assertEq(token.balanceOf(alice), 0);

        vm.expectEmit(true, true, false, true);
        emit Transfer(address(0), alice, 15_000_000);
        vm.prank(operator);
        token.mint(alice, 15_000_000);
        assertEq(token.balanceOf(alice), 15_000_000);
        assertEq(token.totalSupply(), 15_000_000);
    }

    function test_TransferMovesBalance() public {
        vm.prank(operator);
        token.mint(alice, 1_000);
        vm.expectEmit(true, true, false, true);
        emit Transfer(alice, bob, 400);
        vm.prank(alice);
        assertTrue(token.transfer(bob, 400));
        assertEq(token.balanceOf(alice), 600);
        assertEq(token.balanceOf(bob), 400);
        assertEq(token.totalSupply(), 1_000);
    }

    function test_TransferAboveBalanceReverts() public {
        vm.prank(operator);
        token.mint(alice, 10);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MockINR.InsufficientBalance.selector, uint256(10), uint256(11)));
        token.transfer(bob, 11);
    }

    function test_TransferToZeroReverts() public {
        vm.prank(operator);
        token.mint(alice, 10);
        vm.prank(alice);
        vm.expectRevert(MockINR.ZeroAddress.selector);
        token.transfer(address(0), 1);
    }

    function test_ApproveAndTransferFrom() public {
        vm.prank(operator);
        token.mint(alice, 1_000);
        vm.expectEmit(true, true, false, true);
        emit Approval(alice, bob, 300);
        vm.prank(alice);
        assertTrue(token.approve(bob, 300));
        assertEq(token.allowance(alice, bob), 300);

        vm.prank(bob);
        assertTrue(token.transferFrom(alice, bob, 200));
        assertEq(token.allowance(alice, bob), 100);
        assertEq(token.balanceOf(bob), 200);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MockINR.InsufficientAllowance.selector, uint256(100), uint256(101)));
        token.transferFrom(alice, bob, 101);
    }

    function test_MaxAllowanceIsNotSpent() public {
        vm.prank(operator);
        token.mint(alice, 1_000);
        vm.prank(alice);
        token.approve(bob, type(uint256).max);
        vm.prank(bob);
        token.transferFrom(alice, bob, 500);
        assertEq(token.allowance(alice, bob), type(uint256).max);
    }
}
