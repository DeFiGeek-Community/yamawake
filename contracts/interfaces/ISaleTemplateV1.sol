// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

interface ISaleTemplateV1 {
    function initialize(
        address token_,
        address owner_,
        uint allocatedAmount_,
        uint startingAt_,
        uint eventDuration_,
        uint minRaisedAmount_
    ) external returns (bool);
}
