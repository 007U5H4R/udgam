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
    uint256 internal otherKey = 0xB0B;
    address internal attestor;

    bytes32 internal constant ID = keccak256("AG-TEST0001");
    bytes32 internal constant BATCH = keccak256("B-TEST0001");
    uint256 internal constant AGREED_GRAMS = 500_000; // 500.0 kg
    uint8 internal constant MIN_GRADE = 80; // Very good
    uint256 internal constant AMOUNT = 5_000_000; // ₹50,000.00 in paise
    uint256 internal constant START_BALANCE = 10_000_000;
    uint64 internal deadline;

    event AgreementCreated(bytes32 indexed id, address indexed buyer, address fpoPayee, bytes32 termsHash);
    event Funded(bytes32 indexed id, uint256 amount);
    event Settled(bytes32 indexed id, bytes32 indexed batchIdHash, address fpoPayee, uint256 amount);
    event SettlementRejected(bytes32 indexed id, bytes32 indexed batchIdHash, uint8 reasons);
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

    function _sign(uint256 key, bytes32 id, bytes32 batch, uint8 grade) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, farming.gradeDigest(id, batch, grade));
        return abi.encodePacked(r, s, v);
    }

    function _settle(uint256 grams, bool allVerified, uint8 grade) internal {
        bytes memory sig = _sign(attestorKey, ID, BATCH, grade);
        vm.prank(operator);
        farming.settle(ID, BATCH, grams, allVerified, grade, sig);
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
        vm.stopPrank();    _reconcile();
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

    function test_FundAfterDeadlineReverts() public {
        _create();
        vm.warp(uint256(deadline) + 1);
        vm.startPrank(buyer);
        token.approve(address(farming), AMOUNT);
        vm.expectRevert(ContractFarming.DeadlinePassed.selector);
        farming.fund(ID);
        vm.stopPrank();
        assertEq(uint8(_status()), uint8(ContractFarming.Status.Created));
        assertEq(token.balanceOf(address(farming)), 0);
        _reconcile();
    }

    function test_FundAtTheDeadlineStillWorks() public {
        _create();
        vm.warp(uint256(deadline));
        _fund();
        assertEq(uint8(_status()), uint8(ContractFarming.Status.Funded));
        _reconcile();
    }

    function test_FundUnknownAgreementReverts() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.None));
        farming.fund(ID);    _reconcile();
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

    // ── TSK-25.3: settlement conditions (TC-084; EVAL-093–099) ───────────────────────────────────

    /// All 8 (quantity met, grade met, all Verified) combinations: only all-true releases (EVAL-093);
    /// the single-false rows are EVAL-094 (quantity), EVAL-095 (grade) and EVAL-096 (verification).
    function test_TC084_AllEightCombinations() public {
        for (uint256 i = 0; i < 8; i++) {
            bool qty = i & 1 != 0;
            bool grd = i & 2 != 0;
            bool ver = i & 4 != 0;
            uint256 snap = vm.snapshotState();
            _create();
            _fund();
            uint256 grams = qty ? 512_000 : 499_500;
            uint8 grade = grd ? 90 : 70;
            uint8 expectReasons = (qty ? 0 : 1) | (grd ? 0 : 2) | (ver ? 0 : 4);
            if (expectReasons == 0) {
                vm.expectEmit(true, true, false, true);
                emit Settled(ID, BATCH, fpo, AMOUNT);
            } else {
                vm.expectEmit(true, true, false, true);
                emit SettlementRejected(ID, BATCH, expectReasons);
            }
            _settle(grams, ver, grade);
            if (expectReasons == 0) {
                assertEq(token.balanceOf(fpo), AMOUNT, "all-true releases exactly the amount");
                assertEq(token.balanceOf(address(farming)), 0);
                assertEq(uint8(_status()), uint8(ContractFarming.Status.Settled));
            } else {
                assertEq(token.balanceOf(fpo), 0, "a failed condition releases nothing");
                assertEq(token.balanceOf(address(farming)), AMOUNT, "escrow unchanged");
                assertEq(uint8(_status()), uint8(ContractFarming.Status.Funded), "stays funded");
            }
            _reconcile();
            vm.revertToState(snap);
        }
    }

    function test_EVAL093_ReleasesExactAmountAtTheBoundary() public {
        _create();
        _fund();
        _settle(AGREED_GRAMS, true, MIN_GRADE); // exactly the agreed grams and exactly the minimum grade
        assertEq(token.balanceOf(fpo), AMOUNT);
        assertEq(uint8(_status()), uint8(ContractFarming.Status.Settled));
        _reconcile();
    }

    function test_EVAL094_QuantityShortByHalfAKilogramRejected() public {
        _create();
        _fund();
        vm.expectEmit(true, true, false, true);
        emit SettlementRejected(ID, BATCH, 1);
        _settle(499_500, true, 90);
        assertEq(token.balanceOf(address(farming)), AMOUNT);
        _reconcile();
    }

    function test_EVAL095_GradeBelowMinimumRejected() public {
        _create();
        _fund();
        vm.expectEmit(true, true, false, true);
        emit SettlementRejected(ID, BATCH, 2);
        _settle(512_000, true, 70);
        assertEq(token.balanceOf(address(farming)), AMOUNT);
        _reconcile();
    }

    function test_EVAL096_NotAllVerifiedRejected() public {
        _create();
        _fund();
        vm.expectEmit(true, true, false, true);
        emit SettlementRejected(ID, BATCH, 4);
        _settle(512_000, false, 90);
        assertEq(token.balanceOf(address(farming)), AMOUNT);
        _reconcile();
    }

    function test_RejectedThenLaterDeliverySettles() public {
        _create();
        _fund();
        _settle(499_500, true, 90);
        _settle(512_000, true, 90);
        assertEq(token.balanceOf(fpo), AMOUNT);
        _reconcile();
    }

    function test_EVAL097_SecondSettlementReverts() public {
        _create();
        _fund();
        _settle(512_000, true, 90);
        bytes memory sig = _sign(attestorKey, ID, BATCH, 90);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.Settled));
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        assertEq(token.balanceOf(fpo), AMOUNT, "released once");
        _reconcile();
    }

    function test_EVAL098_NonOperatorSettleReverts() public {
        _create();
        _fund();
        bytes memory sig = _sign(attestorKey, ID, BATCH, 90);
        vm.prank(stranger);
        vm.expectRevert(ContractFarming.NotOperator.selector);
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        vm.prank(buyer);
        vm.expectRevert(ContractFarming.NotOperator.selector);
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        assertEq(token.balanceOf(address(farming)), AMOUNT);
        _reconcile();
    }

    function test_EVAL099_WrongKeySignatureReverts() public {
        _create();
        _fund();
        bytes memory sig = _sign(otherKey, ID, BATCH, 90);
        vm.prank(operator);
        vm.expectRevert(ContractFarming.BadGradeSignature.selector);
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        assertEq(token.balanceOf(address(farming)), AMOUNT);
        _reconcile();
    }

    function test_EVAL099_SignatureOverDifferentGradeReverts() public {
        _create();
        _fund();
        bytes memory sig = _sign(attestorKey, ID, BATCH, 70);
        vm.prank(operator);
        vm.expectRevert(ContractFarming.BadGradeSignature.selector);
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        _reconcile();
    }

    function test_EVAL099_SignatureOverDifferentBatchReverts() public {
        _create();
        _fund();
        bytes memory sig = _sign(attestorKey, ID, keccak256("B-OTHER"), 90);
        vm.prank(operator);
        vm.expectRevert(ContractFarming.BadGradeSignature.selector);
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        _reconcile();
    }

    function test_MalformedSignaturesRevert() public {
        _create();
        _fund();
        bytes memory good = _sign(attestorKey, ID, BATCH, 90);
        vm.startPrank(operator);
        vm.expectRevert(ContractFarming.BadGradeSignature.selector);
        farming.settle(ID, BATCH, 512_000, true, 90, hex"1234");
        // a high-s (malleable) twin of a valid signature is refused
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(good, 32))
            s := mload(add(good, 64))
            v := byte(0, mload(add(good, 96)))
        }
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory twin = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.expectRevert(ContractFarming.BadGradeSignature.selector);
        farming.settle(ID, BATCH, 512_000, true, 90, twin);
        vm.stopPrank();
        _reconcile();
    }

    function test_GradeAbove100Reverts() public {
        _create();
        _fund();
        bytes memory sig = _sign(attestorKey, ID, BATCH, 101);
        vm.prank(operator);
        vm.expectRevert(ContractFarming.BadTerms.selector);
        farming.settle(ID, BATCH, 512_000, true, 101, sig);
        _reconcile();
    }

    function test_SettleUnfundedReverts() public {
        _create();
        bytes memory sig = _sign(attestorKey, ID, BATCH, 90);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.Created));
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        _reconcile();
    }

    function test_SettleAfterDeadlineReverts() public {
        _create();
        _fund();
        vm.warp(uint256(deadline) + 1);
        bytes memory sig = _sign(attestorKey, ID, BATCH, 90);
        vm.prank(operator);
        vm.expectRevert(ContractFarming.DeadlinePassed.selector);
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        _reconcile();
    }

    function test_SettleAfterRefundReverts() public {
        _create();
        _fund();
        vm.warp(uint256(deadline) + 1);
        vm.prank(buyer);
        farming.refund(ID);
        bytes memory sig = _sign(attestorKey, ID, BATCH, 90);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.Refunded));
        farming.settle(ID, BATCH, 512_000, true, 90, sig);
        _reconcile();
    }

    function test_RefundAfterSettleReverts() public {
        _create();
        _fund();
        _settle(512_000, true, 90);
        vm.warp(uint256(deadline) + 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ContractFarming.WrongStatus.selector, ContractFarming.Status.Settled));
        farming.refund(ID);
        _reconcile();
    }

    // ── review fix: one delivered batch releases at most one escrow ──────────────────────────────

    bytes32 internal constant ID2 = keccak256("AG-TEST0002");

    function _createAndFund(bytes32 id) internal {
        vm.prank(operator);
        farming.createAgreement(id, buyer, attestor, fpo, AGREED_GRAMS, MIN_GRADE, AMOUNT, deadline);
        vm.startPrank(buyer);
        token.approve(address(farming), AMOUNT);
        farming.fund(id);
        vm.stopPrank();
    }

    function _settleAs(bytes32 id, uint256 grams) internal {
        bytes memory sig = _sign(attestorKey, id, BATCH, 90);
        vm.prank(operator);
        farming.settle(id, BATCH, grams, true, 90, sig);
    }

    function test_SameBatchReleasesOnlyOneAgreement() public {
        _createAndFund(ID);
        _createAndFund(ID2);
        _settleAs(ID, 512_000);
        assertTrue(farming.batchReleased(BATCH));
        bytes memory sig = _sign(attestorKey, ID2, BATCH, 90);
        vm.prank(operator);
        vm.expectRevert(ContractFarming.BatchAlreadyReleased.selector);
        farming.settle(ID2, BATCH, 512_000, true, 90, sig);
        assertEq(token.balanceOf(fpo), AMOUNT, "paid once");
        assertEq(token.balanceOf(address(farming)), AMOUNT, "the second escrow stays funded");
        (,,,,,,, ContractFarming.Status s2) = farming.agreements(ID2);
        assertEq(uint8(s2), uint8(ContractFarming.Status.Funded));
        _reconcile();
    }

    function test_RejectedBatchDoesNotCountAsReleased() public {
        _createAndFund(ID);
        _createAndFund(ID2);
        _settleAs(ID, 499_500); // short: rejected, nothing paid
        assertFalse(farming.batchReleased(BATCH));
        _settleAs(ID2, 512_000);
        assertTrue(farming.batchReleased(BATCH));
        assertEq(token.balanceOf(fpo), AMOUNT);
        _reconcile();
    }

    // ── review nit: the creation event carries a hash of the terms, not the terms ────────────────

    function test_CreatedEventCarriesTermsHashOnly() public {
        bytes32 termsHash = keccak256(abi.encode(uint256(500_000), uint8(80), uint256(5_000_000), deadline));
        assertEq(farming.termsHash(AGREED_GRAMS, MIN_GRADE, AMOUNT, deadline), termsHash);
        vm.expectEmit(true, true, false, true);
        emit AgreementCreated(ID, buyer, fpo, termsHash);
        _create();
    }
}
