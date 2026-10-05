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

    address public immutable operator;
    IERC20Minimal public immutable token;

    mapping(bytes32 id => Agreement) public agreements;

    event AgreementCreated(bytes32 indexed id, address indexed buyer, address fpoPayee, uint256 agreedGrams, uint8 minGrade, uint256 amount, uint64 deadline);
    event Funded(bytes32 indexed id, uint256 amount);
    event Refunded(bytes32 indexed id, uint256 amount);

    error NotOperator();
    error NotBuyer();
    error ZeroAddress();
    error BadTerms();
    error WrongStatus(Status status);
    error DeadlineNotPassed();
    error TransferFailed();

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
}
