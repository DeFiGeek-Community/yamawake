// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFactory.sol";

contract Distributor {
    using SafeERC20 for IERC20;
    IFactory public factory;
    IERC20 public token;
    mapping(address => uint256) public scores;

    event ScoreAdded(
        address indexed scorerAddress,
        address indexed userAddress,
        uint256 scoreAdded
    );

    event Claimed(address indexed userAddress, uint256 amount);

    constructor(address factory_, address token_) {
        factory = IFactory(factory_);
        token = IERC20(token_);
    }

    function addScore(address target_, uint256 amount_) external onlyAuction {
        scores[target_] += amount_;
        emit ScoreAdded(msg.sender, target_, amount_);
    }

    function claim(address target_) external {
        uint256 _score = scores[target_];
        require(_score > 0, "Not eligible to get rewarded");

        uint256 _balance = token.balanceOf(address(this));
        require(_balance > 0, "No reward available.");

        if (_balance < _score) {
            _score = _balance;
        }

        scores[target_] = 0;
        token.safeTransfer(target_, _score);
        emit Claimed(target_, _score);
    }

    /// @dev Allow only scorers who is registered in Factory
    modifier onlyAuction() {
        require(factory.auctions(msg.sender), "You are not the auction.");
        _;
    }
}
