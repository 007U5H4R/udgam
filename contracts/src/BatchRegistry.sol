// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title BatchRegistry
/// @notice On-chain anchor for the Udgam hash-chain ledger (technical-plan §22 TKT-24, §8.1). The
/// operator appends each ledger entry's hash at its seq, strictly in order from seq 1. There is no
/// update or delete path, so an anchored hash can never be overwritten. The hash-chain store stays the
/// system of record for payloads; this contract only lets a third party compare `entryHash(seq)`.
contract BatchRegistry {
    /// @notice The only account allowed to append (the Udgam server's operator key).
    address public immutable operator;

    /// @notice The seq the next append must use. Ledger seqs start at 1.
    uint64 public nextSeq = 1;

    mapping(uint64 seq => bytes32 entryHash) private _entryHashes;

    event EntryAnchored(uint64 indexed seq, bytes32 entryHash);

    error NotOperator();
    error OutOfOrder(uint64 expected, uint64 given);
    error ZeroHash();
    error ZeroOperator();

    constructor(address operator_) {
        if (operator_ == address(0)) revert ZeroOperator();
        operator = operator_;
    }

    /// @notice Anchor `entryHash_` at `seq`. Reverts unless the caller is the operator and
    /// `seq == nextSeq`, so a seq already anchored can never be written again.
    function append(uint64 seq, bytes32 entryHash_) external {
        if (msg.sender != operator) revert NotOperator();
        if (seq != nextSeq) revert OutOfOrder(nextSeq, seq);
        if (entryHash_ == bytes32(0)) revert ZeroHash();
        _entryHashes[seq] = entryHash_;
        nextSeq = seq + 1;
        emit EntryAnchored(seq, entryHash_);
    }

    /// @notice The hash anchored at `seq`, or zero when `seq` is not anchored yet.
    function entryHash(uint64 seq) external view returns (bytes32) {
        return _entryHashes[seq];
    }
}
