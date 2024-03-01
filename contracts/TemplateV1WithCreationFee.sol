// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./BaseTemplate.sol";

/**
 * @author 0xMotoko
 * @title TemplateV1WithCreationFee
 * @notice Minimal Proxy Platform-ish fork of the HegicInitialOffering.sol
 */
contract TemplateV1WithCreationFee is BaseTemplate, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 private constant TOKEN_UPPER_BOUND = 1e50;
    uint256 private constant TOKEN_BOTTOM_BOUND = 1e6;
    uint256 private constant ETH_UPPER_BOUND = 1_000_000_000 ether;
    /* Multiplier derived from the practical max number of digits for eth (18 + 8) + 1 to avoid rounding error. */
    uint256 private constant SCALE_FACTOR = 1e27;
    /* Minimum bidding amount is set to minimize the possibility of refunds. */
    uint256 private constant MIN_BID_AMOUNT = 0.001 ether;
    /// Fixed rate for calculate the reward score
    uint256 private constant REWARD_SCORE_RATE = 100;
    /// Fixed amount of the creation fee 0.1ETH
    uint256 public constant CREATION_FEE = 0.1 ether;

    IERC20 public erc20onsale;
    uint256 public allocatedAmount;
    uint256 public minRaisedAmount;

    uint256 public totalRaised;
    mapping(address => uint256) public raised;

    constructor(
        address factory_,
        address feePool_,
        address distributor_
    ) BaseTemplate(factory_, feePool_, distributor_) {}

    function initialize(
        address owner_,
        uint256 startingAt_,
        uint256 eventDuration_,
        address token_,
        uint256 allocatedAmount_,
        uint256 minRaisedAmount_
    ) external payable onlyFactory returns (address, uint256) {
        require(!initialized, "This contract has already been initialized");
        initialized = true;

        require(msg.value == CREATION_FEE, "The creation fee must be 0.1 ETH");
        require(owner_ != address(0), "owner must be there");
        require(token_ != address(0), "Go with non null address.");
        require(
            allocatedAmount_ >= TOKEN_BOTTOM_BOUND,
            "allocatedAmount must be greater than or equal to 1e6."
        );
        require(
            allocatedAmount_ <= TOKEN_UPPER_BOUND,
            "allocatedAmount must be less than or equal to 1e50."
        );
        require(
            block.timestamp <= startingAt_,
            "startingAt must be in the future"
        );
        require(eventDuration_ >= 1 days, "event duration is too short");
        require(eventDuration_ <= 30 days, "event duration is too long");
        require(
            minRaisedAmount_ <= ETH_UPPER_BOUND,
            "minRaisedAmount must be less than or equal to 1e27."
        );

        owner = owner_;
        startingAt = startingAt_;
        closingAt = startingAt_ + eventDuration_;
        erc20onsale = IERC20(token_);
        allocatedAmount = allocatedAmount_;
        minRaisedAmount = minRaisedAmount_;

        (bool success, ) = payable(feePool).call{value: msg.value}("");
        require(success, "transfer failed");

        emit Deployed(
            address(this),
            owner_,
            startingAt_,
            closingAt,
            token_,
            abi.encodePacked(address(0)),
            abi.encode(allocatedAmount_, minRaisedAmount_)
        );
        return (token_, allocatedAmount_);
    }

    receive() external payable {
        require(
            startingAt <= block.timestamp,
            "The offering has not started yet"
        );
        require(block.timestamp <= closingAt, "The offering has already ended");
        require(
            msg.value >= MIN_BID_AMOUNT,
            "The amount must be greater than or equal to 0.001ETH"
        );

        uint256 newTotalRaised = totalRaised + msg.value;
        require(
            newTotalRaised < SCALE_FACTOR,
            "totalRaised is unexpectedly high"
        );

        totalRaised = newTotalRaised;
        raised[msg.sender] += msg.value;
        emit Raised(msg.sender, address(0), msg.value);
    }

    function claim(
        address participant,
        address recipient
    ) external nonReentrant {
        require(
            block.timestamp > closingAt,
            "Early to claim. Sale is not finished."
        );
        uint256 raisedAmount = raised[participant];
        require(raisedAmount > 0, "You don't have any contribution.");
        raised[participant] = 0;

        uint256 erc20allocation = _calculateAllocation(
            raisedAmount,
            totalRaised,
            allocatedAmount
        );
        if (totalRaised >= minRaisedAmount && erc20allocation != 0) {
            if (msg.sender != participant && participant != recipient) {
                revert("participant or recipient invalid");
            }
            erc20onsale.safeTransfer(recipient, erc20allocation);

            IDistributor(distributor).addScore(
                participant,
                raisedAmount * REWARD_SCORE_RATE
            );

            emit Claimed(participant, recipient, raisedAmount, erc20allocation);
        } else {
            /* Refund process */
            (bool success, ) = payable(participant).call{value: raisedAmount}(
                ""
            );
            require(success, "transfer failed");
            emit Claimed(participant, recipient, raisedAmount, 0);
        }
    }

    function _calculateAllocation(
        uint256 us,
        uint256 tr,
        uint256 aa
    ) internal pure returns (uint256 al) {
        al = (((us * SCALE_FACTOR) / tr) * aa) / SCALE_FACTOR;
    }

    /*
        Finished, and enough Ether raised.
        
        Owner: Withdraws Ether
        Contributors: Can claim and get their own ERC-20
    */
    function withdrawRaisedETH() external nonReentrant {
        require(closingAt < block.timestamp, "Withdrawal unavailable yet.");
        require(
            totalRaised >= minRaisedAmount,
            "The required amount has not been raised!"
        );

        if (closingAt + 3 days >= block.timestamp) {
            uint256 minAllocation = _calculateAllocation(
                MIN_BID_AMOUNT,
                totalRaised,
                allocatedAmount
            );

            require(
                minAllocation > 0,
                "Refund candidates may exist. Withdrawal unavailable yet."
            );
        }

        uint256 gross = address(this).balance;
        uint256 fee = (gross) / 100;

        (bool feeSuccess, ) = payable(feePool).call{value: fee}("");
        require(feeSuccess, "Fee transfer failed");

        IDistributor(distributor).addScore(owner, gross * REWARD_SCORE_RATE);
        (bool success, ) = payable(owner).call{value: address(this).balance}(
            ""
        );
        require(success, "Withdraw failed");
    }

    /*
        Finished, but the privided token is not enough. (Failed sale)
        
        Owner: Withdraws ERC-20
        Contributors: Claim and get back Ether
    */
    function withdrawERC20Onsale() external {
        require(closingAt < block.timestamp, "The offering must be completed");
        require(
            totalRaised < minRaisedAmount || totalRaised == 0,
            "The required amount has been raised!"
        );
        erc20onsale.safeTransfer(owner, allocatedAmount);
    }

    function initializeTransfer(
        address token_,
        uint256 amount_,
        address to_
    ) external payable onlyDelegateFactory {
        IERC20(token_).safeTransferFrom(msg.sender, to_, amount_);
    }
}
