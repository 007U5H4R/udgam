// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title MockINR
/// @notice Mock Indian rupees for the contract-farming escrow demo (technical-plan §22 TKT-25, TSK-25.1).
/// Not real money. A minimal ERC-20 with 2 decimals, so one unit is one paisa. Only the operator (the
/// Udgam server) mints. Written without a library on purpose: the cloud build is offline (forge
/// `offline = true`), and the token needs nothing beyond plain ERC-20.
contract MockINR {
    string public constant name = "Mock INR";
    string public constant symbol = "mINR";
    uint8 public constant decimals = 2;

    /// @notice The only account allowed to mint.
    address public immutable operator;

    uint256 public totalSupply;
    mapping(address owner => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotOperator();
    error ZeroAddress();
    error InsufficientBalance(uint256 balance, uint256 needed);
    error InsufficientAllowance(uint256 allowance, uint256 needed);

    constructor(address operator_) {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
    }

    /// @notice Create `amount` paise for `to`. Operator only.
    function mint(address to, uint256 amount) external {
        if (msg.sender != operator) revert NotOperator();
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Move `amount` from `from` to `to` using the caller's allowance. An allowance of
    /// type(uint256).max is never spent (the common ERC-20 convention).
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance(allowed, amount);
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 have = balanceOf[from];
        if (have < amount) revert InsufficientBalance(have, amount);
        balanceOf[from] = have - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
