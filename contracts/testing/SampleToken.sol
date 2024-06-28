// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @author 0xMotoko
 * @title SampleToken
 * @notice No feature, for test.
 */
contract SampleToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("SampleToken", "SMPL") {
        _mint(msg.sender, initialSupply);
    }

    function approve(
        address spender,
        uint256 amount
    ) public virtual override returns (bool) {
        require(
            _msgSender() != spender,
            "sender and spender shouldn't be the same."
        );
        require(amount > 0, "Amount is zero.");

        _approve(_msgSender(), spender, amount);
        return true;
    }
}
