// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.19;

import "./interfaces/IDistributor.sol";

/// @title BaseTemplate
/// @author DeFiGeek Community Japan
/// @notice Base template for each auction template
/// @dev Extend this contract for each auction template
contract BaseTemplate {
    /// Flags that manage instance initialization
    bool initialized;

    address immutable feePool;
    address immutable factory;
    address immutable distributor;
    address public owner;
    uint256 public startingAt;
    uint256 public closingAt;

    /// @notice Record deployed parameters
    /// @dev Use primitives for important information, bytes type compression for other information.
    /// @param deployedAddress Deployed address of an auction
    /// @param owner The address of auction owner
    /// @param startingAt  The timestamp when the auction starts
    /// @param closingAt The timestamp when the auction ends
    /// @param auctionToken The address of the token being auctioned
    /// @param raisedTokens Concatenated addresses of the raised tokens
    /// @param args Concatenated template-specific parameters in bytes
    event Deployed(
        address deployedAddress,
        address owner,
        uint256 startingAt,
        uint256 closingAt,
        address auctionToken,
        bytes raisedTokens,
        bytes args
    );

    /// @notice Record claim parameters
    /// @dev Emit this event to track claim information when participants claim
    /// @param participant The address of the user who contributed
    /// @param recipient The address of the user who received the token allocation
    /// @param userShare  The amount of the participant's contribution
    /// @param allocation The amount of the participant's token allocation
    event Claimed(
        address indexed participant,
        address indexed recipient,
        uint256 userShare,
        uint256 allocation
    );

    /// @notice Record raised parameters
    /// @dev Emit this event when the auction receives funds from participants to track raised information
    /// @param participant The address of the user who contributed
    /// @param token The address of the raised token
    /// @param amount  The amount of the raised token
    event Raised(address indexed participant, address token, uint256 amount);

    constructor(address factory_, address feePool_, address distributor_) {
        factory = factory_;
        feePool = feePool_;
        distributor = distributor_;
    }

    /// @dev Allow only owner of auction instance
    modifier onlyOwner() {
        require(msg.sender == owner, "You are not the owner.");
        _;
    }

    /// @dev Allow only delegatecall from factory
    modifier onlyDelegateFactory() {
        require(address(this) == factory, "You are not the factory.");
        _;
    }
    /// @dev Allow only call from factory
    modifier onlyFactory() {
        require(msg.sender == factory, "You are not the factory.");
        _;
    }
}
