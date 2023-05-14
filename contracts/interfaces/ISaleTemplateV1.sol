// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

interface ISaleTemplateV1 {
    function initialize(
        address token_,
        address owner_,
        uint distributeAmount_,
        uint startingAt_,
        uint eventDuration_,
        uint minimalProvideAmount_
    ) external returns (bool);
}
