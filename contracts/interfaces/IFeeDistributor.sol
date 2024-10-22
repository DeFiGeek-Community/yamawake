// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

interface IFeeDistributor {
    function addRewardToken(address coin_) external returns (bool);

    function tokenFlags(address _address) external view returns (bool);

    function checkpointToken(address token_) external;
}
