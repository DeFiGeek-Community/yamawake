// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.19;

import {CCIPReceiver} from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IFactory.sol";

/// @title Distributor
/// @author DeFiGeek Community Japan
/// @notice Distributes early user rewards
/// @dev Requires reward funds to be sent to this contract
contract DistributorReceiver is Ownable, CCIPReceiver {
    using SafeERC20 for IERC20;

    IFactory public factory;
    IERC20 public token;
    mapping(address => uint256) public scores;

    // Mapping to keep track of allowlisted source chains.
    mapping(uint64 => mapping(address => bool))
        public allowlistedSourceChainSenders;

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

    // Used when the source chain has not been allowlisted by the contract owner.
    error SourceChainSenderNotAllowlisted(
        uint64 sourceChainSelector,
        address sender
    );

    constructor(
        address factory_,
        address token_,
        address router_
    ) CCIPReceiver(router_) {
        factory = IFactory(factory_);
        token = IERC20(token_);
    }

    /// @dev Modifier that checks if the chain with the given sourceChainSelector is allowlisted.
    /// @param _sourceChainSelector The selector of the destination chain.
    modifier onlyAllowlisted(uint64 _sourceChainSelector, address _sender) {
        if (!allowlistedSourceChainSenders[_sourceChainSelector][_sender]) {
            revert SourceChainSenderNotAllowlisted(
                _sourceChainSelector,
                _sender
            );
        }
        _;
    }

    function setAllowlistSourceChainSender(
        uint64 _sourceChainSelector,
        address _sender,
        bool allowed
    ) external onlyOwner {
        allowlistedSourceChainSenders[_sourceChainSelector][_sender] = allowed;
    }

    /// @dev Allow only scorers who is registered in Factory
    modifier onlyAuction() {
        require(factory.auctions(msg.sender), "You are not the auction.");
        _;
    }

    /// @notice Add a specified amount to the score of a specified user
    /// @dev Expected to be called from auction contracts
    /// @param target_ The address of the user who is rewarded
    /// @param amount_ The amount of the score to be added
    function addScore(address target_, uint256 amount_) external onlyAuction {
        _addScore(target_, amount_);
    }

    /// @notice Add a specified amount to the score of a specified user
    function rescueScore(address target_, uint256 amount_) external onlyOwner {
        _addScore(target_, amount_);
    }

    function _ccipReceive(
        Client.Any2EVMMessage memory message
    )
        internal
        override
        onlyAllowlisted(
            message.sourceChainSelector,
            abi.decode(message.sender, (address))
        )
    {
        (address target, uint256 amount, bool isClaim) = abi.decode(
            message.data,
            (address, uint256, bool)
        );

        _addScore(target, amount);

        if (isClaim) {
            _claim(target);
        }
    }

    /// @notice Add a specified amount to the score of a specified user
    /// @dev Expected to be called from auction contracts
    /// @param target_ The address of the user who is rewarded
    /// @param amount_ The amount of the score to be added
    function _addScore(address target_, uint256 amount_) internal {
        scores[target_] += amount_;
        emit ScoreAdded(msg.sender, target_, amount_);
    }

    /// @notice Claim early user rewards
    /// @dev Epected to be called from rewarded users
    /// @param target_ The address of the user who is rewarded
    function claim(address target_) external {
        _claim(target_);
    }

    /// @notice Claim early user rewards
    /// @dev Epected to be called from rewarded users
    /// @param target_ The address of the user who is rewarded
    function _claim(address target_) internal {
        uint256 _score = scores[target_];
        require(_score > 0, "Not eligible to get rewarded");

        uint256 _balance = token.balanceOf(address(this));

        if (_balance < _score) {
            _score = _balance;
        }

        scores[target_] -= _score;
        token.safeTransfer(target_, _score);
        emit Claimed(target_, _score);
    }

    function withdrawToken(
        address token_,
        address target_,
        uint256 amount_
    ) external onlyOwner {
        IERC20(token_).safeTransfer(target_, amount_);
    }
}
