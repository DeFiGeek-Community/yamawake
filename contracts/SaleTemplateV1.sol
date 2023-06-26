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

    address public constant factory = address(0x4fd561E2A7CD4c1Bf830e45b34542DAB459E7d70);

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
    uint public totalProvided = 0;
    mapping(address => uint) public provided;

    event Claimed(address indexed account, uint userShare, uint allocation);
    event Received(address indexed account, uint amount);

    receive() external payable {
        require(
            startingAt <= block.timestamp,
            "The offering has not started yet"
        );
        require(block.timestamp <= closingAt, "The offering has already ended");
        totalProvided += msg.value;
        provided[msg.sender] += msg.value;
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
        require(provided[contributor] > 0, "You don't have any contribution.");

        uint userShare = provided[contributor];
        provided[contributor] = 0;

        uint erc20allocation = _calculateAllocation(
            userShare,
            totalProvided,
            allocatedAmount
        );
        if (totalProvided >= minRaisedAmount && erc20allocation != 0) {
            if (
                /* claiming for oneself */
                (msg.sender == contributor && contributor == recipient) ||
                /* claiming for someone other */
                (msg.sender != contributor && contributor == recipient) ||
                /* giving her contribution to someone other by her own will */
                (msg.sender == contributor && contributor != recipient)
            ) {
                erc20onsale.transfer(recipient, erc20allocation);
                emit Claimed(recipient, userShare, erc20allocation);
            } else {
                revert("contributor or recipient invalid");
            }
        } else {
            /* Refund process */
            payable(contributor).transfer(userShare);
            emit Claimed(contributor, userShare, 0);
        }
    }

    function _calculateAllocation(
        uint us,
        uint tp,
        uint tda
    ) internal pure returns (uint al) {
        /* 
            us<tp is always true and so us/tp is always zero
            tda can be 1 to (2^256-1)/10^18
            (us x tda) can overflow
            tda/tp can be zero
        */

        /* 
            For a sale such that accumulates many ETH, and selling token is a few (e.g., Art NFTs),
            if the claimer depoited only a few ETH, then allocation is 0 and will be refunded.
            That would be acceptable behavior.
        */
        if (tda < tp) {
            al = (us * tda) / tp;
        } else {
            /* sender's share is very tiny and so calculate tda/tp first */
            al = us * (tda / tp);
        }
    }

    /*
        Finished, and enough Ether provided.
        
        Owner: Withdraws Ether
        Contributors: Can claim and get their own ERC-20
    */
    function withdrawProvidedETH() external onlyOwner nonReentrant {
        require(
            closingAt + 3 days < block.timestamp,
            "Withdrawal unavailable yet."
        );
        require(
            totalProvided >= minRaisedAmount,
            "The required amount has not been provided!"
        );

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
            totalProvided < minRaisedAmount || totalProvided == 0,
            "The required amount has been provided!"
        );
        erc20onsale.transfer(owner, allocatedAmount);
    }
}
