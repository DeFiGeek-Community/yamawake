// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

interface IBasicPlugin {
    function upgrade() external returns (bool);
}
