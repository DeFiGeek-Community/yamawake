// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.19;

interface IFactory {
    function auctions(address _address) external view returns (bool);
}
