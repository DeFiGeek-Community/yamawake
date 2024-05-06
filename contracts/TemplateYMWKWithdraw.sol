// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import "./BaseTemplate.sol";

/**
 * @title TemplateYMWKWithdraw
 */
contract TemplateYMWKWithdraw is BaseTemplate {
    constructor(
        address factory_,
        address feePool_,
        address distributor_
    ) BaseTemplate(factory_, feePool_, distributor_) {}

    /// @notice Initialize an auction
    /// @dev Expected to be called by the factory's deployAuction function
    function initialize() external payable onlyFactory {
        require(!initialized, "This contract has already been initialized");
        initialized = true;
    }

    function addScore(uint amount) external {
        require(msg.sender == factory.call(abi.encodeWithSignature("owner()")));

        IDistributor(distributor).addScore(msg.sender, amount);
    }
}
