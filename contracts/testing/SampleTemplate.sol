// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../BaseTemplate.sol";

interface IFeeDistributor {
    function addRewardToken(address coin_) external returns (bool);

    function tokenFlags(address _address) external view returns (bool);
}

/**
 * @author 0xMotoko
 * @title TemplateV1
 * @notice Minimal Proxy Platform-ish fork of the HegicInitialOffering.sol
 */
contract SampleTemplate is BaseTemplate, ReentrancyGuard {
    uint256 private constant TOKEN_UPPER_BOUND = 1e50;
    uint256 private constant TOKEN_BOTTOM_BOUND = 1e6;
    uint256 private constant ETH_UPPER_BOUND = 1_000_000_000 ether;
    /* Multiplier derived from the practical max number of digits for eth (18 + 8) + 1 to avoid rounding error. */
    uint256 private constant SCALE_FACTOR = 1e27;
    /* Minimum bidding amount is set to minimize the possibility of refunds. */
    uint256 private constant MIN_BID_AMOUNT = 0.001 ether;
    /// Fixed rate for calculate the reward score
    uint256 private constant REWARD_SCORE_RATE = 100;

    address public immutable feeDistributor;

    IERC20 public erc20onsale;
    uint256 public allocatedAmount;
    uint256 public minRaisedAmount;

    uint256 public totalRaised;
    mapping(address => uint256) public raised;

    constructor(
        address factory_,
        address feePool_,
        address distributor_,
        address feeDistributor_
    ) BaseTemplate(factory_, feePool_, distributor_) {
        feeDistributor = feeDistributor_;
    }

    function initialize(
        address token_,
        uint256 allocatedAmount_
    ) external payable onlyFactory returns (address, uint256) {
        require(!initialized, "This contract has already been initialized");
        initialized = true;

        return (token_, allocatedAmount_);
    }

    receive() external payable {}

    function claim(
        address participant,
        address recipient
    ) external nonReentrant {}

    /*
        Mock function for testing FeeDistributor
    */
    function withdrawRaisedETH() external nonReentrant {
        payable(feeDistributor).transfer(address(this).balance);
    }

    /*
        Mock function for testing FeeDistributor
    */
    function withdrawRaisedToken(address token_) external {
        if (!IFeeDistributor(feeDistributor).tokenFlags(token_)) {
            require(
                IFeeDistributor(feeDistributor).addRewardToken(token_),
                "Failed to add reward"
            );
        }

        require(
            IERC20(token_).transfer(
                feeDistributor,
                IERC20(token_).balanceOf(address(this))
            ),
            "Transfer failed"
        );
    }

    function initializeTransfer(
        address token_,
        uint256 amount_,
        address to_
    ) external onlyDelegateFactory {
        IERC20(token_).transferFrom(msg.sender, to_, amount_);
    }
}
