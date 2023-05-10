// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IBasicPlugin.sol";

contract BasicPlugin is IBasicPlugin, ReentrancyGuard {
    function upgrade() public override returns (bool) {
        return true;
    }
}
