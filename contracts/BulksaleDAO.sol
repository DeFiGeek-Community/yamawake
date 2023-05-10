// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IBasicPlugin.sol";

contract BulksaleDAO is ReentrancyGuard {
    IBasicPlugin public BasicPlugin;

    constructor(address _basicPlugin) {
        BasicPlugin = IBasicPlugin(_basicPlugin);
    }

    function upgrade() public returns (bool) {
        return BasicPlugin.upgrade();
    }
}
