pragma solidity ^0.8.3;

/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Yamato
 * Copyright (C) 2021 Yamato Protocol (DeFiGeek Community Japan)
 *
 * This Factory is a fork of Murray Software's deliverables.
 * And this entire project is including the fork of Hegic Protocol.
 * Hence the license is alinging to the GPL-3.0
*/

/*
The MIT License (MIT)
Copyright (c) 2018 Murray Software, LLC.
Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:
The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
//solhint-disable max-line-length
//solhint-disable no-inline-assembly

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ITemplateContract.sol";

contract Factory is ReentrancyGuard {
    mapping(string => address) public templates;
    address public governance;
    uint nonce = 0;
    event Deployed(address indexed sender, string indexed templateName, address indexed deployedAddr, bytes abiArgs);
    event TokenCloneDeployed(address indexed sender, string indexed templateName, address indexed deployedAddr, bytes abiArgs);
    event TemplateAdded(string indexed templateName, address indexed templateAddr, address indexed governer);
    event GovernanceChanged(address indexed oldGoverner, address indexed newGoverner);
    event Received(address indexed sender, uint fee, uint treasury);
    event Withdrawn(address indexed sender, address governance, uint amount, uint treasuryAfter);

    /*
        External Interfaces
    */
    function deploy(string memory templateName, address tokenAddr, uint sellingAmount, bytes memory abiArgs) public nonReentrant returns (address deployedAddr) {

        /* 1. Args must be non-empty and allowance is enough. */
        require(bytes(templateName).length > 0, "Empty string.");
        require(tokenAddr != address(0), "Go with non null address.");

        address templateAddr = templates[templateName];

        require(templateAddr != address(0), "No such template in the list.");

        require(sellingAmount > 0, "Having an event without tokens are not permitted.");

        uint _allowance = IERC20(tokenAddr).allowance(msg.sender, address(this));
        require(_allowance > 0, "You have to approve ERC-20 to deploy.");
        require(_allowance >= sellingAmount, "allowance is not enough.");

        /* 2. Make a clone. */
        deployedAddr = _createClone(templateAddr, abiArgs);

        /* 3. Fund it. */
        require(
            IERC20(tokenAddr).transferFrom(msg.sender, deployedAddr, sellingAmount)
            , "TransferFrom failed.");


        /* 4. Initialize it. */
        require(
            ITemplateContract(deployedAddr).initialize(abiArgs)
            , "Failed to initialize the cloned contract.");

        
        emit Deployed(msg.sender, templateName, deployedAddr, abiArgs);
    }
    function deployTokenClone(string memory templateName, bytes memory abiArgs) public returns (address deployedAddr) {

        /* 1. Args must be non-empty and allowance is enough. */
        require(bytes(templateName).length > 0, "Empty string.");

        address templateAddr = templates[templateName];

        require(templateAddr != address(0), "No such template in the list.");

        /* 2. Make a clone. */
        deployedAddr = _createClone(templateAddr, abiArgs);

        /* 3. Initialize it. */
        require(
            ITemplateContract(deployedAddr).initialize(abiArgs)
            , "Failed to initialize the cloned contract.");
        
        emit TokenCloneDeployed(msg.sender, templateName, deployedAddr, abiArgs);
    }

    function addTemplate(string memory templateName, address templateAddr /* Dear governer; deploy it beforehand. */) public onlyGovernance {
        require(templates[templateName] == address(0), "This template name is already taken.");
        templates[templateName] = templateAddr;
        emit TemplateAdded(templateName, templateAddr, governance);
    }

    modifier onlyGovernance {
        require(msg.sender == governance, "You're not the governer.");
        _;
    }
    constructor(address initialOwner){
        governance = initialOwner;
    }
    receive() external payable {
        emit Received(msg.sender, msg.value, address(this).balance);
    }
    function withdraw(address to, uint amount) public onlyGovernance nonReentrant {
        require(to != address(0), "Don't discard treaury!");
        require(address(this).balance >= amount, "Amount is too big");

        (bool success,) = payable(to).call{value:amount}("");
        require(success,"transfer failed");

        emit Withdrawn(msg.sender, governance, amount, address(this).balance);
    }
    function setGovernance(address newGoverner) public onlyGovernance {
        require(newGoverner != address(0), "governer cannot be null");
        emit GovernanceChanged(governance, newGoverner);
        governance = newGoverner;
    }



    /*
        Internal Helpers
    */
    function _createClone(address target, bytes memory abiArgs) internal returns (address result) {
        bytes20 targetBytes = bytes20(target);
        nonce += 1;
        bytes32 salt = keccak256(abi.encodePacked(target, abiArgs, msg.sender, nonce));
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            result := create2(0, clone, 0x37, salt)
        }
    }

    function isClone(address target, address query) internal view returns (bool result) {
        bytes20 targetBytes = bytes20(target);
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x363d3d373d3d3d363d7300000000000000000000000000000000000000000000)
            mstore(add(clone, 0xa), targetBytes)
            mstore(add(clone, 0x1e), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)

            let other := add(clone, 0x40)
            extcodecopy(query, other, 0, 0x2d)
            result := and(
            eq(mload(clone), mload(other)),
            eq(mload(add(clone, 0xd)), mload(add(other, 0xd)))
            )
        }
    }
}