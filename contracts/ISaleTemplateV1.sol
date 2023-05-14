// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

interface ISaleTemplateV1 {
    event Initialized(uint distributeAmount, bytes indexed abiBytes);

    function initialize(
        uint distributeAmount,
        bytes memory abiBytes
    ) external returns (bool);
}
