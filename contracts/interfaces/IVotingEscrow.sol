// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

interface IVotingEscrow {
    struct Point {
        int128 bias;
        int128 slope;
        uint256 ts;
        uint256 blk;
    }

    function balanceOf(address addr, uint256 t) external view returns (uint256);

    function balanceOf(address addr) external view returns (uint256);

    function checkpoint() external;

    function epoch() external view returns (uint256);

    function getLastUserSlope(address addr) external view returns (int128);

    function lockedEnd(address addr) external view returns (uint256);

    function pointHistory(uint256 loc) external view returns (Point memory);

    function totalSupply(uint256 t) external view returns (uint256);

    function userPointEpoch(address user) external view returns (uint256);

    function userPointHistory(
        address addr,
        uint256 loc
    ) external view returns (Point memory);

    function userPointHistoryTs(
        address addr,
        uint256 epoch
    ) external view returns (uint256);
}

// interface IVotingEscrow {
//     function userPointEpoch(address addr) external view returns (uint256);

//     function epoch() external view returns (uint256);

//     function userPointHistory(
//         address addr,
//         uint256 loc
//     ) external view returns (Point memory);

//     function pointHistory(uint256 loc) external view returns (Point memory);

//     function checkpoint() external;
// }
