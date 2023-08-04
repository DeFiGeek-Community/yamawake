// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

contract BaseTemplate {
    /// Flags that manage instance initialization
    bool initialized;

    address public immutable feePool;
    address public immutable factory;
    address public owner;
    uint256 public startingAt;
    uint256 public closingAt;

    /// @notice Record deployed parameters
    /// @dev Use primitives for important information, bytes type compression for other information.
    /// @param raisedTokens Concatenate address with the number of auction tokens
    /// @param args Concatenate template-specific parameters to bytes
    event Deployed(
        address deployedAddress,
        address owner,
        uint256 startingAt,
        uint256 closingAt,
        address auctionToken,
        bytes raisedTokens,
        bytes args
    );

    constructor(address factory_, address feePool_) {
        factory = factory_;
        feePool = feePool_;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "You are not the owner.");
        _;
    }

    /// @dev Allow only delegatecall from factory
    modifier onlyFactory() {
        require(address(this) == factory, "You are not the factory.");
        _;
    }
}
