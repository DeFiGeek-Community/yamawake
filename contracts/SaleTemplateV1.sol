// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/ISaleTemplate.sol";

/**
 * @author 0xMotoko
 * @title SaleTemplateV1
 * @notice Minimal Proxy Platform-ish fork of the HegicInitialOffering.sol
 */
contract SaleTemplateV1 is ISaleTemplate, ReentrancyGuard {
    /*
        ==========================================
        === Template Idiom Declarations Begins ===
        ==========================================
    */
    bool initialized;

    address public immutable feePool;
    uint256 private constant TOKEN_UPPER_BOUND = 1e50;
    uint256 private constant TOKEN_BOTTOM_BOUND = 1e6;
    uint256 private constant ETH_UPPER_BOUND = 1e27;

    /*
        You can't use constructor
        because the minimal proxy is really minimal.
        
        Proxy is minimal
        = no constructor
        = You can't access the Proxy constructor's SSTORE slot
        from implementation constructor's SLOAD slot.

        === DEFINE YOUR OWN ARGS BELOW ===

    */

    /* States in the deployment initialization */
    uint256 public startingAt;
    uint256 public closingAt;
    uint256 public allocatedAmount;
    uint256 public minRaisedAmount;
    address public owner;
    IERC20 public erc20onsale;

    /* Multiplier derived from the practical max number of digits for eth (18 + 8) + 1 to avoid rounding error. */
    uint256 private constant SCALE_FACTOR = 1e27;
    /* Minimum bidding amount is set to minimize the possibility of refunds. */
    uint256 private constant MIN_BID_AMOUNT = 1e15;

    /* States end */

    constructor(address feePool_) {
        feePool = feePool_;
    }

    function initialize(
        address token_,
        address owner_,
        uint256 allocatedAmount_,
        uint256 startingAt_,
        uint256 eventDuration_,
        uint256 minRaisedAmount_
    ) external returns (address, uint256) {
        require(!initialized, "This contract has already been initialized");

        require(token_ != address(0), "Go with non null address.");
        require(
            block.timestamp <= startingAt_,
            "startingAt must be in the future"
        );
        require(eventDuration_ >= 1 days, "event duration is too short");
        require(eventDuration_ <= 30 days, "event duration is too long");
        require(owner_ != address(0), "owner must be there");

        require(
            allocatedAmount_ >= TOKEN_BOTTOM_BOUND,
            "allocatedAmount must be greater than or equal to 1e6."
        );

        require(
            allocatedAmount_ <= TOKEN_UPPER_BOUND,
            "allocatedAmount must be less than or equal to 1e50."
        );

        require(
            minRaisedAmount_ <= ETH_UPPER_BOUND,
            "minRaisedAmount must be less than or equal to 1e27."
        );

        erc20onsale = IERC20(token_);
        startingAt = startingAt_;
        closingAt = startingAt_ + eventDuration_;
        allocatedAmount = allocatedAmount_;
        minRaisedAmount = minRaisedAmount_;
        owner = owner_;
        initialized = true;
        return (token_, allocatedAmount_);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "You are not the owner.");
        _;
    }
    /*
        ========================================
        === Template Idiom Declarations Ends ===
        ========================================
    */

    /*
        Let's go core logics :)
    */
    uint256 public totalRaised;
    mapping(address => uint256) public raised;

    event Claimed(address indexed contributor, address indexed recipient, uint userShare, uint allocation);
    event Received(address indexed account, uint amount);

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
        emit Received(msg.sender, msg.value);
    }

    function claim(
        address contributor,
        address recipient
    ) external nonReentrant {
        require(
            block.timestamp > closingAt,
            "Early to claim. Sale is not finished."
        );
        require(raised[contributor] > 0, "You don't have any contribution.");

        uint256 userShare = raised[contributor];
        raised[contributor] = 0;

        uint256 erc20allocation = _calculateAllocation(
            userShare,
            totalRaised,
            allocatedAmount
        );
        if (totalRaised >= minRaisedAmount && erc20allocation != 0) {
            if (
                /* claiming for oneself */
                (msg.sender == contributor && contributor == recipient) ||
                /* claiming for someone other */
                (msg.sender != contributor && contributor == recipient) ||
                /* giving her contribution to someone other by her own will */
                (msg.sender == contributor && contributor != recipient)
            ) {
                erc20onsale.transfer(recipient, erc20allocation);
                emit Claimed(contributor, recipient, userShare, erc20allocation);
            } else {
                revert("contributor or recipient invalid");
            }
        } else {
            /* Refund process */
            payable(contributor).transfer(userShare);
            emit Claimed(contributor, recipient, userShare, 0);
        }
    }

    function _calculateAllocation(
        uint256 us,
        uint256 tr,
        uint256 aa
    ) internal pure returns (uint256 al) {
        /* 
            us<tr is always true and so us/tr is always zero
            aa can be 1 to 10^50
            (us x aa) can overflow
            aa/tr can be zero
            tr is always less than 10^27 (1_000_000_000 ETH)
        */
        al = (((us * SCALE_FACTOR) / tr) * aa) / SCALE_FACTOR;
    }

    /*
        Finished, and enough Ether raised.
        
        Owner: Withdraws Ether
        Contributors: Can claim and get their own ERC-20
    */
    function withdrawRaisedETH() external onlyOwner nonReentrant {
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

        uint256 fee = (address(this).balance) / 100;
        payable(feePool).transfer(fee);
        payable(owner).transfer(address(this).balance);
    }

    /*
        Finished, but the privided token is not enough. (Failed sale)
        
        Owner: Withdraws ERC-20
        Contributors: Claim and get back Ether
    */
    function withdrawERC20Onsale() external onlyOwner nonReentrant {
        require(closingAt < block.timestamp, "The offering must be completed");
        require(
            totalRaised < minRaisedAmount || totalRaised == 0,
            "The required amount has been raised!"
        );
        erc20onsale.transfer(owner, allocatedAmount);
    }
}
