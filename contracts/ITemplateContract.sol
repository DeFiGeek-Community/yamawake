// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

interface ITemplateContract {
    event Initialized(bytes indexed abiBytes);

    function initialize(bytes memory abiBytes) external returns (bool);
}
