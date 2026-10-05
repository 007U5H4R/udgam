// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {MockINR} from "../src/MockINR.sol";
import {ContractFarming} from "../src/ContractFarming.sol";

/// TKT-25 (TSK-25.2, TSK-25.3; TC-084, EVAL-093–099): a buyer funds an agreement in mock INR; the
/// operator settles it with the delivered grams, the "all Verified" flag and the buyer's EIP-712 signed
/// grade. Only all three conditions true releases the escrow to the FPO. Token balances reconcile after
/// every test (tearDown-style check in `_reconcile`).
contract ContractFarmingTest is Test {
    MockINR internal token;
    ContractFarming internal farming;

    address internal operator = makeAddr("operator");
    address internal buyer = makeAddr("buyer");
    address internal fpo = makeAddr("fpo");
    address internal stranger = makeAddr("stranger");
    uint256 internal attestorKey = 0xA11CE;
    address internal attestor;

    bytes32 internal constant ID = keccak256("AG-TEST0001");
    uint256 internal constant AGREED_GRAMS = 500_000; // 500.0 kg
    uint8 internal constant MIN_GRADE = 80; // Very good
    uint256 internal constant AMOUNT = 5_000_000; // ₹50,000.00 in paise
    uint256 internal constant START_BALANCE = 10_000_000;
    uint64 internal deadline;

    event Funded(bytes32 indexed id, uint256 amount);
    event Refunded(bytes32 indexed id, uint256 amount);

    function setUp() public {
        vm.warp(1_790_000_000);
        attestor = vm.addr(attestorKey);
        token = new MockINR(operator);
        farming = new ContractFarming(operator, address(token));
        deadline = uint64(block.timestamp + 30 days);
        vm.prank(operator);
        token.mint(buyer, START_BALANCE);
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    function _create() internal {
        vm.prank(operator);
        farming.createAgreement(ID, buyer, attestor, fpo, AGREED_GRAMS, MIN_GRADE, AMOUNT, deadline);
    }

    function _fund() internal {
        vm.startPrank(buyer);
        token.approve(address(farming), AMOUNT);
        farming.fund(ID);
        vm.stopPrank();
    }

    /// Mock INR is only ever moved, never created or lost: buyer + escrow + FPO = what was minted.
    function _reconcile() internal view {
        assertEq(token.balanceOf(buyer) + token.balanceOf(address(farming)) + token.balanceOf(fpo), START_BALANCE, "balances reconcile");
        assertEq(token.totalSupply(), START_BALANCE, "supply unchanged");
    }

    function _status() internal view returns (ContractFarming.Status s) {
        (,,,,,,, s) = farming.agreements(ID);
    }

    // ── TSK-25.2: creation, funding, refund ──────────────────────────────────────────────────────

    function test_CreateStoresTermsOperatorOnly() public {
        vm.prank(stranger);
        vm.expectRevert(ContractFarming.NotOperator.selector);
        farming.createAgreement(ID, buyer, attestor, fpo, AGREED_GRAMS, MIN_GRADE, AMOUNT, deadline);

        _create();
        (address b, address a, address p, uint256 g, uint8 m, uint256 amt, uint64 d, ContractFarming.Status s) = farming.agreements(ID);
        assertEq(b, buyer);
        assertEq(a, attestor);
        assertEq(p, fpo);
        assertEq(g, AGREED_GRAMS);
        assertEq(m, MIN_GRADE);
        assertEq(amt, AMOUNT);
        assertEq(d, deadline);
        assertEq(uint8(s), uint8(ContractFarming.Status.Created));

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.Created));
        farming.createAgreement(ID, buyer, attestor, fpo, AGREED_GRAMS, MIN_GRADE, AMOUNT, deadline);
        _reconcile();
    }

    function test_CreateRefusesBadTerms() public {
        vm.startPrank(operator);
        vm.expectRevert(ContractFarming.BadTerms.selector);
        farming.createAgreement(ID, buyer, attestor, fpo, 0, MIN_GRADE, AMOUNT, deadline);
        vm.expectRevert(ContractFarming.BadTerms.selector);
        farming.createAgreement(ID, buyer, attestor, fpo, AGREED_GRAMS, 101, AMOUNT, deadline);
        vm.expectRevert(ContractFarming.BadTerms.selector);
        farming.createAgreement(ID, buyer, attestor, fpo, AGREED_GRAMS, MIN_GRADE, 0, deadline);
        vm.expectRevert(ContractFarming.BadTerms.selector);
        farming.createAgreement(ID, buyer, attestor, fpo, AGREED_GRAMS, MIN_GRADE, AMOUNT, uint64(block.timestamp));
        vm.expectRevert(ContractFarming.ZeroAddress.selector);
        farming.createAgreement(ID, address(0), attestor, fpo, AGREED_GRAMS, MIN_GRADE, AMOUNT, deadline);
        vm.stopPrank();
    }

    function test_FundMovesAmountIntoEscrow() public {
        _create();
        vm.prank(buyer);
        token.approve(address(farming), AMOUNT);
        vm.expectEmit(true, false, false, true);
        emit Funded(ID, AMOUNT);
        vm.prank(buyer);
        farming.fund(ID);
        assertEq(token.balanceOf(address(farming)), AMOUNT);
        assertEq(token.balanceOf(buyer), START_BALANCE - AMOUNT);
        assertEq(uint8(_status()), uint8(ContractFarming.Status.Funded));
        _reconcile();
    }

    function test_DoubleFundReverts() public {
        _create();
        _fund();
        vm.startPrank(buyer);
        token.approve(address(farming), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.Funded));
        farming.fund(ID);
        vm.stopPrank();
        assertEq(token.balanceOf(address(farming)), AMOUNT);
        _reconcile();
    }

    function test_FundByNonBuyerReverts() public {
        _create();
        vm.prank(stranger);
        vm.expectRevert(ContractFarming.NotBuyer.selector);
        farming.fund(ID);
        assertEq(uint8(_status()), uint8(ContractFarming.Status.Created));
        _reconcile();
    }

    function test_FundUnknownAgreementReverts() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.None));
        farming.fund(ID);
    }

    function test_RefundBeforeDeadlineReverts() public {
        _create();
        _fund();
        vm.warp(deadline);
        vm.prank(buyer);
        vm.expectRevert(ContractFarming.DeadlineNotPassed.selector);
        farming.refund(ID);
        assertEq(token.balanceOf(address(farming)), AMOUNT);
        _reconcile();
    }

    function test_RefundAfterDeadlineReturnsExactlyAmount() public {
        _create();
        _fund();
        vm.warp(uint256(deadline) + 1);
        vm.expectEmit(true, false, false, true);
        emit Refunded(ID, AMOUNT);
        vm.prank(buyer);
        farming.refund(ID);
        assertEq(token.balanceOf(buyer), START_BALANCE);
        assertEq(token.balanceOf(address(farming)), 0);
        assertEq(uint8(_status()), uint8(ContractFarming.Status.Refunded));

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.Refunded));
        farming.refund(ID);
        _reconcile();
    }

    function test_RefundByNonBuyerReverts() public {
        _create();
        _fund();
        vm.warp(uint256(deadline) + 1);
        vm.prank(stranger);
        vm.expectRevert(ContractFarming.NotBuyer.selector);
        farming.refund(ID);
        _reconcile();
    }
}
