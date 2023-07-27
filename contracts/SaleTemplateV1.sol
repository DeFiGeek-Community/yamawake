// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/ISaleTemplateV1.sol";

/**
 * @author 0xMotoko
 * @title SaleTemplateV1
 * @notice Minimal Proxy Platform-ish fork of the HegicInitialOffering.sol
 */
contract SaleTemplateV1 is ISaleTemplateV1, ReentrancyGuard {
    /*
        ==========================================
        === Template Idiom Declarations Begins ===
        ==========================================
    */
    bool initialized;

    address public constant factory = address(0x9df4FEa0e015eB8110f984fca8ac43F1d713451C);

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
    uint public startingAt;
    uint public closingAt;
    uint public allocatedAmount;
    uint public minRaisedAmount;
    address public owner;
    IERC20 public erc20onsale;

    /* Multiplier derived from the practical max number of digits for eth (18 + 8) + 1 to avoid rounding error. */
    uint private constant SCALE_FACTOR = 1e27;
    /* Minimum bidding amount is set to minimize the possibility of refunds. */
    uint private constant MIN_BID_AMOUNT = 1e15;

    /* States end */

    function initialize(
        address token_,
        address owner_,
        uint allocatedAmount_,
        uint startingAt_,
        uint eventDuration_,
        uint minRaisedAmount_
    ) external override returns (bool) {
        require(!initialized, "This contract has already been initialized");
        require(msg.sender == factory, "You are not the Factory.");

        erc20onsale = IERC20(token_);
        startingAt = startingAt_;
        closingAt = startingAt_ + eventDuration_;
        allocatedAmount = allocatedAmount_;
        minRaisedAmount = minRaisedAmount_;
        owner = owner_;
        initialized = true;
        return true;
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
    uint public totalRaised = 0;
    mapping(address => uint) public raised;

    event Claimed(address indexed contributor, address indexed recipient, uint userShare, uint allocation);
    event Received(address indexed account, uint amount);

    receive() external payable {
        require(
            startingAt <= block.timestamp,
            "The offering has not started yet"
        );
        require(
            block.timestamp <= closingAt,
            "The offering has already ended"
        );
        require(
            msg.value >= MIN_BID_AMOUNT,
            "The amount must be greater than or equal to 0.001ETH"
        );

        uint256 newTotalRaised = totalRaised + msg.value;
        require(newTotalRaised < SCALE_FACTOR, "totalRaised is unexpectedly high");

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

        uint userShare = raised[contributor];
        raised[contributor] = 0;

        uint erc20allocation = _calculateAllocation(
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
        uint us,
        uint tr,
        uint aa
    ) internal pure returns (uint al) {
        /* 
            us<tr is always true and so us/tr is always zero
            aa can be 1 to 10^50
            (us x aa) can overflow
            aa/tr can be zero
            tr is always less than 10^27 (1_000_000_000 ETH)
        */
        al = ((us * SCALE_FACTOR) / tr) * aa / SCALE_FACTOR;
    }

    /*
        Finished, and enough Ether raised.
        
        Owner: Withdraws Ether
        Contributors: Can claim and get their own ERC-20
    */
    function withdrawRaisedETH() external onlyOwner nonReentrant {
        require(
            closingAt < block.timestamp,
            "Withdrawal unavailable yet."
        );
        require(
            totalRaised >= minRaisedAmount,
            "The required amount has not been raised!"
        );

        if(closingAt + 3 days >= block.timestamp) {
            uint minAllocation = _calculateAllocation(
                MIN_BID_AMOUNT,
                totalRaised,
                allocatedAmount
            );

            require(
                minAllocation > 0, 
                "Refund candidates may exist. Withdrawal unavailable yet."
            );
        }

        uint fee = (address(this).balance) / 100;
        payable(factory).transfer(fee);
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
