// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IFactory.sol";

/// @title Distributor
/// @author DeFiGeek Community Japan
/// @notice Distributes early user rewards
/// @dev Requires reward funds to be sent to this contract
contract DistributorSender is Ownable {
    IFactory public factory;
    IRouterClient public router;

    mapping(address => uint256) public scores;

    // Mapping to keep track of allowlisted source chains.
    mapping(uint64 => mapping(address => bool))
        public allowlistedDestinationChainSenders;

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
    /// @param messageId The unique ID of the CCIP message.
    /// @param userAddress The address of the user who claimed
    /// @param amount The amount of the token claimed
    event ScoreSent(
        bytes32 messageId,
        address indexed userAddress,
        uint256 amount
    );

    // Used when the destination chain has not been allowlisted by the contract owner.
    error DestinationChainSenderNotAllowlisted(
        uint64 destinationChainSelector,
        address sender
    );

    constructor(address factory_, address router_) {
        factory = IFactory(factory_);
        router = IRouterClient(router_);
    }

    /// @notice Add a specified amount to the score of a specified user
    /// @dev Expected to be called from auction contracts
    /// @param target_ The address of the user who is rewarded
    /// @param amount_ The amount of the score to be added
    function addScore(address target_, uint256 amount_) external onlyAuction {
        scores[target_] += amount_;
        emit ScoreAdded(msg.sender, target_, amount_);
    }

    /// @dev Modifier that checks if the chain with the given destinationChainSelector is allowlisted.
    /// @param _destinationChainSelector The selector of the destination chain.
    modifier onlyAllowlisted(
        uint64 _destinationChainSelector,
        address _sender
    ) {
        if (
            !allowlistedDestinationChainSenders[_destinationChainSelector][
                _sender
            ]
        ) {
            revert DestinationChainSenderNotAllowlisted(
                _destinationChainSelector,
                _sender
            );
        }
        _;
    }

    /// @notice Claim early user rewards
    /// @dev Epected to be called from rewarded users
    /// @param target_ The address of the user who is rewarded
    function sendScorePayNative(
        uint64 destinationChainSelector_,
        address receiver_,
        address target_,
        bool isClaim_
    )
        external
        payable
        onlyAllowlisted(destinationChainSelector_, receiver_)
        returns (bytes32 messageId)
    {
        uint256 _score = scores[target_];
        require(_score > 0, "Not eligible to get rewarded");

        scores[target_] = 0;

        Client.EVM2AnyMessage memory encodedMessage = _buildCCIPMessage(
            receiver_,
            target_,
            _score,
            isClaim_,
            address(0)
        );

        // Get the fee required to send the CCIP message
        uint256 fees = router.getFee(destinationChainSelector_, encodedMessage);
        require(fees == msg.value, "Invalid fee amount");

        // Send the CCIP message through the router and store the returned CCIP message ID
        messageId = router.ccipSend{value: fees}(
            destinationChainSelector_,
            encodedMessage
        );

        emit ScoreSent(messageId, target_, _score);
    }

    /// @notice Claim early user rewards
    /// @dev Epected to be called from rewarded users
    /// @param target_ The address of the user who is rewarded
    function sendScorePayToken(
        uint64 destinationChainSelector_,
        address receiver_,
        address target_,
        bool isClaim_,
        address payToken_
    )
        external
        onlyAllowlisted(destinationChainSelector_, receiver_)
        returns (bytes32 messageId)
    {
        uint256 _score = scores[target_];
        require(_score > 0, "Not eligible to get rewarded");

        scores[target_] = 0;

        Client.EVM2AnyMessage memory encodedMessage = _buildCCIPMessage(
            receiver_,
            target_,
            _score,
            isClaim_,
            payToken_
        );

        // Get the fee required to send the CCIP message
        uint256 fees = router.getFee(destinationChainSelector_, encodedMessage);

        IERC20(payToken_).transferFrom(msg.sender, address(this), fees);
        IERC20(payToken_).approve(address(router), fees);

        // Send the CCIP message through the router and store the returned CCIP message ID
        messageId = router.ccipSend(destinationChainSelector_, encodedMessage);

        emit ScoreSent(messageId, target_, _score);
    }

    /// @notice Construct a CCIP message.
    /// @dev This function will create an EVM2AnyMessage struct with all the necessary information for sending a text.
    /// @param _receiver The address of the receiver.
    /// @param _target The string data to be sent.
    /// @param _amount The string data to be sent.
    /// @param _feeToken The address of the token used for fees. Set address(0) for native gas.
    /// @return Client.EVM2AnyMessage Returns an EVM2AnyMessage struct which contains information for sending a CCIP message.
    function _buildCCIPMessage(
        address _receiver,
        address _target,
        uint256 _amount,
        bool _isClaim,
        address _feeToken
    ) private pure returns (Client.EVM2AnyMessage memory) {
        // Create an EVM2AnyMessage struct in memory with necessary information for sending a cross-chain message
        return
            Client.EVM2AnyMessage({
                receiver: abi.encode(_receiver), // ABI-encoded receiver address
                data: abi.encode(_target, _amount, _isClaim), // ABI-encoded string
                tokenAmounts: new Client.EVMTokenAmount[](0), // Empty array aas no tokens are transferred
                extraArgs: "",
                // Set the feeToken to a feeTokenAddress, indicating specific asset will be used for fees
                feeToken: _feeToken
            });
    }

    /// @dev Allow only scorers who is registered in Factory
    modifier onlyAuction() {
        require(factory.auctions(msg.sender), "You are not the auction.");
        _;
    }
}
