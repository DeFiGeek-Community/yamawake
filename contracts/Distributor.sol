// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IFactory {
    function rewardScorers(address _address) external view returns (bool);
}

contract Distributor is ReentrancyGuard {
    IFactory public factory;
    IERC20 public token;
    mapping(address => uint256) public rewardScores;

    event ScoreAdded(
        address indexed scorerAddress,
        address indexed userAddress,
        uint256 scoreAdded,
        uint256 totalScore
    );

    event Claimed(address indexed userAddress, uint256 amount);

    constructor(address factory_, address token_) {
        factory = IFactory(factory_);
        token = IERC20(token_);
    }

    function addScore(
        address targetAddress,
        uint256 amount
    ) external onlyVerifiedScorer {
        rewardScores[targetAddress] += amount;
    }

    function claim() external nonReentrant {
        uint256 _score = rewardScores[msg.sender];
        require(_score > 0, "Not eligible to get rewarded");

        uint256 _balance = token.balanceOf(address(this));
        require(_balance > 0, "No reward available.");

        if (_balance < _score) {
            _score = _balance;
        }

        rewardScores[msg.sender] = 0;
        token.transfer(msg.sender, _score);
    }

    /// @dev Allow only scorers who is registered in Factory
    modifier onlyVerifiedScorer() {
        require(
            factory.rewardScorers(msg.sender),
            "You are not the verified scorer."
        );
        _;
    }
}
