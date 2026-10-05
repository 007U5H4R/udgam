// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice The two ERC-20 calls the escrow needs.
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title ContractFarming
/// @notice Contract-farming escrow (technical-plan §22 TKT-25, TSK-25.2 and TSK-25.3; Solution-PRD F17).
/// A buyer funds an agreement in mock INR. The operator (the Udgam server, the only settle caller)
/// settles it with the delivered grams and whether every included picking is Verified, which the server
/// attests, plus the buyer's quality grade, which is an EIP-712 signature by the buyer's attestor key.
/// The escrow pays the FPO only when delivered grams ≥ agreed grams, grade ≥ the minimum grade and every
/// picking is Verified. Otherwise it records why (SettlementRejected) and stays funded, so a later
/// delivery can still settle it until the deadline. After the deadline an unsettled agreement can be
/// refunded to the buyer, so the escrow never locks money forever.
///
/// Trust, stated plainly: delivered grams and "all Verified" are the server operator's attestation; the
/// grade signature proves which buyer account decided (a server-held key per buyer organisation), not a
/// personal device key. The contract enforces the arithmetic and the signatures.
contract ContractFarming {
    enum Status {
        None,
        Created,
        Funded,
        Settled,
        Refunded
    }

    struct Agreement {
        address buyer;
        address buyerAttestor;
        address fpoPayee;
        uint256 agreedGrams;
        uint8 minGrade;
        uint256 amount;
        uint64 deadline;
        Status status;
    }

    /// @notice SettlementRejected reason bits: which condition was not met.
    uint8 public constant REASON_QUANTITY = 1;
    uint8 public constant REASON_GRADE = 2;
    uint8 public constant REASON_VERIFIED = 4;

    bytes32 public constant QUALITY_GRADE_TYPEHASH = keccak256("QualityGrade(bytes32 agreementId,bytes32 batchIdHash,uint8 grade)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("Udgam ContractFarming");
    bytes32 private constant VERSION_HASH = keccak256("1");
    /// secp256k1n / 2: signatures with a higher s are malleable twins and are refused.
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable operator;
    IERC20Minimal public immutable token;

    mapping(bytes32 id => Agreement) public agreements;
    /// @notice Batches already paid out: one delivered batch releases at most one escrow, across agreements.
    mapping(bytes32 batchIdHash => bool) public batchReleased;

    event AgreementCreated(bytes32 indexed id, address indexed buyer, address fpoPayee, uint256 agreedGrams, uint8 minGrade, uint256 amount, uint64 deadline);
    event Funded(bytes32 indexed id, uint256 amount);
    event Settled(bytes32 indexed id, bytes32 indexed batchIdHash, address fpoPayee, uint256 amount);
    event SettlementRejected(bytes32 indexed id, bytes32 indexed batchIdHash, uint8 reasons);
    event Refunded(bytes32 indexed id, uint256 amount);

    error NotOperator();
    error NotBuyer();
    error ZeroAddress();
    error BadTerms();
    error WrongStatus(Status status);
    error DeadlineNotPassed();
    error DeadlinePassed();
    error BadGradeSignature();
    error TransferFailed();
    error BatchAlreadyReleased();

    constructor(address operator_, address token_) {
        if (operator_ == address(0) || token_ == address(0)) revert ZeroAddress();
        operator = operator_;
        token = IERC20Minimal(token_);
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    /// @notice Record an agreement's terms (operator only). `amount` is in paise; `agreedGrams` in grams.
    function createAgreement(
        bytes32 id,
        address buyer,
        address buyerAttestor,
        address fpoPayee,
        uint256 agreedGrams,
        uint8 minGrade,
        uint256 amount,
        uint64 deadline
    ) external onlyOperator {
        Agreement storage a = agreements[id];
        if (a.status != Status.None) revert WrongStatus(a.status);
        if (buyer == address(0) || buyerAttestor == address(0) || fpoPayee == address(0)) revert ZeroAddress();
        if (agreedGrams == 0 || minGrade > 100 || amount == 0 || deadline <= block.timestamp) revert BadTerms();
        agreements[id] = Agreement(buyer, buyerAttestor, fpoPayee, agreedGrams, minGrade, amount, deadline, Status.Created);
        emit AgreementCreated(id, buyer, fpoPayee, agreedGrams, minGrade, amount, deadline);
    }

    /// @notice Move the agreed amount from the buyer into escrow (the buyer approves it first).
    function fund(bytes32 id) external {
        Agreement storage a = agreements[id];
        if (a.status != Status.Created) revert WrongStatus(a.status);
        if (msg.sender != a.buyer) revert NotBuyer();
        a.status = Status.Funded;
        if (!token.transferFrom(msg.sender, address(this), a.amount)) revert TransferFailed();
        emit Funded(id, a.amount);
    }

    /// @notice After the deadline, the buyer takes an unsettled agreement's money back.
    function refund(bytes32 id) external {
        Agreement storage a = agreements[id];
        if (a.status != Status.Funded) revert WrongStatus(a.status);
        if (msg.sender != a.buyer) revert NotBuyer();
        if (block.timestamp <= a.deadline) revert DeadlineNotPassed();
        a.status = Status.Refunded;
        if (!token.transfer(a.buyer, a.amount)) revert TransferFailed();
        emit Refunded(id, a.amount);
    }

    /// @notice Judge the three conditions for one delivered batch (operator only). Pays the FPO when all
    /// hold; otherwise emits the failed conditions as a bitmask and stays funded. Reverts (nothing judged)
    /// on a non-funded agreement, after the deadline, on a batch already paid out under any agreement, on
    /// a grade above 100 or on a grade signature that does not recover to the agreement's attestor.
    function settle(bytes32 id, bytes32 batchIdHash, uint256 deliveredGrams, bool allVerified, uint8 grade, bytes calldata gradeSig)
        external
        onlyOperator
    {
        Agreement storage a = agreements[id];
        if (a.status != Status.Funded) revert WrongStatus(a.status);
        if (block.timestamp > a.deadline) revert DeadlinePassed();
        if (batchReleased[batchIdHash]) revert BatchAlreadyReleased();
        if (grade > 100) revert BadTerms();
        if (_recover(gradeDigest(id, batchIdHash, grade), gradeSig) != a.buyerAttestor) revert BadGradeSignature();

        uint8 reasons = 0;
        if (deliveredGrams < a.agreedGrams) reasons |= REASON_QUANTITY;
        if (grade < a.minGrade) reasons |= REASON_GRADE;
        if (!allVerified) reasons |= REASON_VERIFIED;
        if (reasons != 0) {
            emit SettlementRejected(id, batchIdHash, reasons);
            return;
        }
        a.status = Status.Settled;
        batchReleased[batchIdHash] = true;
        if (!token.transfer(a.fpoPayee, a.amount)) revert TransferFailed();
        emit Settled(id, batchIdHash, a.fpoPayee, a.amount);
    }

    /// @notice The EIP-712 domain separator (recomputed per call, so it always names this chain).
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @notice The EIP-712 digest a buyer attestor signs for a grade.
    function gradeDigest(bytes32 agreementId, bytes32 batchIdHash, uint8 grade) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(QUALITY_GRADE_TYPEHASH, agreementId, batchIdHash, grade));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// 65-byte r‖s‖v signature → signer; address(0) for anything malformed or malleable.
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_N || (v != 27 && v != 28)) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
