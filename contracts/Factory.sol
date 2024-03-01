// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Factory is Ownable {
    /// @param implementation implementation address
    /// @param initializeSignature function signature of initialize auction
    /// @param transferSignature function signature of transfer token
    struct TemplateInfo {
        address implementation;
        bytes4 initializeSignature;
        bytes4 transferSignature;
    }

    mapping(bytes32 => TemplateInfo) public templates;
    mapping(address => bool) public auctions;

    event Deployed(bytes32 templateName, address deployedAddress);
    event TemplateAdded(
        bytes32 indexed templateName,
        address indexed implementationAddr
    );
    event TemplateRemoved(
        bytes32 indexed templateName,
        address indexed implementationAddr
    );

    function deployAuction(
        bytes32 templateName_,
        bytes calldata args_
    ) external payable returns (address deployedAddr) {
        /* 1. Args must be non-empty and allowance is enough. */
        TemplateInfo memory templateInfo = templates[templateName_];
        address templateAddr = templateInfo.implementation;
        require(templateAddr != address(0), "No such template in the list.");

        /* 2. Make a clone. */
        deployedAddr = _createClone(templateAddr);

        emit Deployed(templateName_, deployedAddr);

        /* 3. Initialize it. */
        (bool success, bytes memory result) = deployedAddr.call{
            value: msg.value
        }(bytes.concat(templateInfo.initializeSignature, args_));
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }

        /* 4. Fund it. */
        // Skip if transferSignature is empty
        if (templateInfo.transferSignature != bytes4(0)) {
            (success, result) = deployedAddr.delegatecall(
                bytes.concat(
                    templateInfo.transferSignature,
                    result,
                    abi.encode(deployedAddr)
                )
            );
            if (!success) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
        }

        /* 5. Register the deployed auction. */
        auctions[deployedAddr] = true;
    }

    function addTemplate(
        bytes32 templateName_,
        address implementationAddr_,
        bytes4 initializeSignature_,
        bytes4 transferSignature_
    ) external onlyOwner {
        require(
            templates[templateName_].implementation == address(0),
            "This template name is already taken."
        );

        templates[templateName_] = TemplateInfo(
            implementationAddr_,
            initializeSignature_,
            transferSignature_
        );

        emit TemplateAdded(templateName_, implementationAddr_);
    }

    function removeTemplate(bytes32 templateName_) external onlyOwner {
        TemplateInfo memory templateInfo = templates[templateName_];
        delete templates[templateName_];

        emit TemplateRemoved(templateName_, templateInfo.implementation);
    }

    /// @dev Deploy implementation's minimal proxy by create
    function _createClone(
        address implementation_
    ) internal returns (address instance) {
        /// @solidity memory-safe-assembly
        assembly {
            // Cleans the upper 96 bits of the `implementation` word, then packs the first 3 bytes
            // of the `implementation` address with the bytecode before the address.
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation_)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            // Packs the remaining 17 bytes of `implementation` with the bytecode after the address.
            mstore(0x20, or(shl(0x78, implementation_), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(0, 0x09, 0x37)
        }
        require(instance != address(0), "ERC1167: create failed");
    }
}
