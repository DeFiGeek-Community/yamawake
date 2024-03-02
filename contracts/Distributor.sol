// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFactory.sol";

/// @title Distributor
/// @author DeFiGeek Community Japan
/// @notice Distributes early user rewards
/// @dev Requires reward funds to be sent to this contract
contract Distributor {
    using SafeERC20 for IERC20;
    IFactory public factory;
    IERC20 public token;
    mapping(address => uint256) public scores;

    /// @notice Records reward score parameters
    /// @dev This event is emitted when a user is rewarded
    /// @param scorerAddress The auction address which requests to add the score
    /// @param userAddress The address of the user who is get rewarded
    /// @param scoreAdded The amount of the score added
    event ScoreAdded(
        address indexed scorerAddress,
        address indexed userAddress,
        uint256 scoreAdded
    );

    /// @notice Records claim parameters
    /// @dev This event is emitted when a user claims
    /// @param userAddress The address of the user who claimed
    /// @param amount The amount of the token claimed
    event Claimed(address indexed userAddress, uint256 amount);

    constructor(address factory_, address token_) {
        factory = IFactory(factory_);
        token = IERC20(token_);
    }

    /// @notice Add a specified amount to the score of a specified user
    /// @dev Expected to be called from auction contracts
    /// @param target_ The address of the user who is rewarded
    /// @param amount_ The amount of the score to be added
    function addScore(address target_, uint256 amount_) external onlyAuction {
        scores[target_] += amount_;
        emit ScoreAdded(msg.sender, target_, amount_);
    }

    /// @notice Claim early user rewards
    /// @dev Epected to be called from rewarded users
    /// @param target_ The address of the user who is rewarded
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
