// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Factory is Ownable {
    /// @param implemention implemention address
    /// @param initializeSignature function signature of initialize auction
    /// @param initializeSignature function signature of transfer token
    struct TemplateInfo {
        address implemention;
        bytes4 initializeSignature;
        bytes4 transferSignature;
    }

    mapping(bytes32 => TemplateInfo) public templates;
    uint256 nonce = 0;

    event Deployed(bytes32 templateName, address deployedAddress);
    event TemplateAdded(
        bytes32 indexed templateName,
        address indexed templateAddr
    );
    event TemplateRemoved(
        bytes32 indexed templateName,
        address indexed templateAddr
    );

    /*
        External Interfaces
    */
    function deployAuction(
        bytes32 templateName_,
        bytes calldata args_
    ) external returns (address deployedAddr) {
        /* 1. Args must be non-empty and allowance is enough. */
        TemplateInfo memory templateInfo = templates[templateName_];
        address templateAddr = templateInfo.implemention;
        require(templateAddr != address(0), "No such template in the list.");

        /* 2. Make a clone. */
        deployedAddr = _createClone(templateAddr);

        emit Deployed(templateName_, deployedAddr);

        /* 3. Initialize it. */
        (bool success, bytes memory result) = deployedAddr.call(
            bytes.concat(templateInfo.initializeSignature, args_)
        );
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }

        /* 4. Fund it. */
        (success, ) = deployedAddr.delegatecall(
            bytes.concat(
                templateInfo.transferSignature,
                result,
                abi.encode(deployedAddr)
            )
        );
        require(success, "Failed to Fund the token.");
    }

    function addTemplate(
        bytes32 templateName_,
        /* Dear governer; deploy it beforehand. */
        address templateAddr_,
        bytes4 initializeSignature_,
        bytes4 transferSignature_
    ) external onlyOwner {
        require(
            templates[templateName_].implemention == address(0),
            "This template name is already taken."
        );

        templates[templateName_] = TemplateInfo(
            templateAddr_,
            initializeSignature_,
            transferSignature_
        );

        emit TemplateAdded(templateName_, templateAddr_);
    }

    function removeTemplate(bytes32 templateName_) external onlyOwner {
        TemplateInfo memory templateInfo = templates[templateName_];
        delete templates[templateName_];

        emit TemplateRemoved(templateName_, templateInfo.implemention);
    }

    /*
        Internal Helpers
    */
    function _createClone(
        address implementation_
    ) internal returns (address result) {
        nonce += 1;
        bytes32 salt = keccak256(abi.encodePacked(implementation_, nonce));
        // OpenZeppelin Contracts (last updated v4.8.0) (proxy/Clones.sol)
        assembly {
            mstore(
                0x00,
                or(
                    shr(0xe8, shl(0x60, implementation_)),
                    0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000
                )
            )
            mstore(
                0x20,
                or(shl(0x78, implementation_), 0x5af43d82803e903d91602b57fd5bf3)
            )
            result := create2(0, 0x09, 0x37, salt)
        }
        require(result != address(0), "ERC1167: create2 failed");
    }
}
