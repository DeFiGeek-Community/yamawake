pragma solidity ^0.8.3;

/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Yamato
 * Copyright (C) 2021 Yamato Protocol (DeFiGeek Community Japan)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ITemplateContract.sol";

/**
 * @author 0xMotoko
 * @title BulksaleV1
 * @notice Minimal Proxy Platform-ish fork of the HegicInitialOffering.sol
 */
contract BulksaleV1 is ITemplateContract, ReentrancyGuard {
    /*
        ==========================================
        === Template Idiom Declarations Begins ===
        ==========================================
    */
    bool initialized = false;

    address public constant factory = address(0x2c08D232cf190DcB7D641254ea5376a9DE17A882);

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
    uint public totalDistributeAmount;
    uint public minimalProvideAmount;
    uint public lockDuration;
    uint public expirationDuration;
    address public owner;
    uint public feeRatePerMil;
    IERC20 public erc20onsale;
    /* States end */

    struct Args {
        address token;
        uint startingAt;
        uint eventDuration;
        uint lockDuration;
        uint expirationDuration;
        uint totalDistributeAmount;
        uint minimalProvideAmount;
        address owner;
        uint feeRatePerMil;
    }

    function initialize(
        bytes memory abiBytes
    ) public override onlyOnce onlyFactory returns (bool) {
        Args memory args = abi.decode(abiBytes, (Args));

        require(
            block.timestamp <= args.startingAt,
            "startingAt must be in the future"
        );
        require(args.eventDuration >= 1 days, "event duration is too short");
        require(
            args.totalDistributeAmount > 0,
            "distribution amount is invalid"
        );
        require(
            args.minimalProvideAmount > 0,
            "minimal provide amount is invalid"
        );
        require(args.lockDuration >= 0, "lock duration is invalid");
        require(
            args.expirationDuration >= 30 days,
            "expiration duration must be more than 30 days"
        );
        require(args.owner != address(0), "owner must be there");
        require(
            1 <= args.feeRatePerMil && args.feeRatePerMil < 100,
            "fee rate is out of range"
        );

        erc20onsale = IERC20(args.token);
        startingAt = args.startingAt;
        closingAt = args.startingAt + args.eventDuration;
        totalDistributeAmount = args.totalDistributeAmount;
        minimalProvideAmount = args.minimalProvideAmount;
        lockDuration = args.lockDuration;
        expirationDuration = args.expirationDuration;
        owner = args.owner;
        feeRatePerMil = args.feeRatePerMil;
        emit Initialized(abiBytes);
        initialized = true;
        return true;
    }

    modifier onlyOnce() {
        require(!initialized, "This contract has already been initialized");
        _;
    }
    modifier onlyFactory() {
        require(msg.sender == factory, "You are not the Factory.");
        _;
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

    event Claimed(
        address indexed account,
        uint userShare,
        uint erc20allocation
    );
    event Received(address indexed account, uint amount);
    event WithdrawnOnFailed(address indexed sender, uint balance);
    event WithdrawnAfterLockDuration(address indexed sender, uint balance);

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
            totalDistributeAmount
        );
        bool isNotExpiredYet = block.timestamp <
            startingAt + expirationDuration;
        bool isTargetReached = totalProvided >= minimalProvideAmount;
        bool allocationNearlyZero = erc20allocation == 0;
        if (isNotExpiredYet && isTargetReached && !allocationNearlyZero) {
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
                revert(
                    "sender is claiming someone other's fund for someone other."
                );
            }
        } else if (
            (isNotExpiredYet && !isTargetReached) ||
            (isNotExpiredYet && allocationNearlyZero)
        ) {
            /* Refund process */
            (bool success, ) = payable(contributor).call{value: userShare}("");
            require(success, "transfer failed");
            emit Claimed(contributor, userShare, 0);
        } else {
            /* Expired. No refund. */
            revert("Claimable term has been expired.");
        }
    }

    function _calculateAllocation(
        uint us,
        uint tp,
        uint tda
    ) internal pure returns (uint al) {
        /* us<tp is always true and so us/tp is always zero */
        /* tda can be 1 to (2^256-1)/10^18 */
        /* (us x tda) can overflow */
        /* tda/tp can be zero */

        if (tda < tp) {
            /* 
        For a sale such that accumulates many ETH, and selling token is a few (e.g., Art NFTs),
        if the claimer depoited only a few ETH, then allocation is 0 and will be refunded.
        That would be acceptable behavior.
        */
            al = (us * tda) / tp;
        } else {
            /* sender's share is very tiny and so calculate tda/tp first */
            al = (tda / tp) * us;
        }
    }

    function ceil(uint a, uint m) internal pure returns (uint) {
        return ((a + m - 1) / m) * m;
    }

    function withdrawProvidedETH() external onlyOwner nonReentrant {
        /*
          Finished, and enough Ether provided.
            
            Owner: Withdraws Ether
            Contributors: Can claim and get their own ERC-20

        */
        require(
            closingAt < block.timestamp,
            "The offering must be finished first."
        );
        require(
            totalProvided >= minimalProvideAmount,
            "The required amount has not been provided!"
        );

        (bool success1, ) = payable(owner).call{
            value: (address(this).balance * (1000 - feeRatePerMil)) / 1000
        }("");
        require(success1, "transfer failed");
        (bool success2, ) = payable(factory).call{
            value: (address(this).balance * feeRatePerMil) / 1000,
            gas: 25000
        }("");
        require(success2, "transfer failed");
    }

    function withdrawERC20Onsale() external onlyOwner nonReentrant {
        /*
          Finished, but the privided token is not enough. (Failed sale)
            
            Owner: Withdraws ERC-20
            Contributors: Claim and get back Ether

        */
        require(closingAt < block.timestamp, "The offering must be completed");
        require(
            totalProvided < minimalProvideAmount,
            "The required amount has been provided!"
        );
        uint _balance = erc20onsale.balanceOf(address(this));
        erc20onsale.transfer(owner, _balance);
        emit WithdrawnOnFailed(msg.sender, _balance);
    }

    function withdrawUnclaimedERC20OnSale() external onlyOwner nonReentrant {
        /*
          Finished, passed lock duration, and still there're unsold ERC-20.
            
            Owner: Withdraws ERC-20
            Contributors: Already claimed and getting their own ERC-20

        */
        require(
            closingAt + lockDuration < block.timestamp,
            "Withdrawal unavailable yet."
        );
        uint _balance = erc20onsale.balanceOf(address(this));
        erc20onsale.transfer(owner, _balance);
        emit WithdrawnAfterLockDuration(msg.sender, _balance);
    }
}
