pragma solidity ^0.8.3;

/**
 * SPDX-License-Identifier: GPL-3.0-or-later
*/

interface ITemplateContract {
    event Initialized(bytes indexed abiBytes);

    function initialize(bytes memory abiBytes) external returns (bool);
}