// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ISaleTemplate.sol";

contract Factory is Ownable {
    /// @param implemention implemention address
    /// @param signature function signature of initialize
    struct TemplateInfo {
        address implemention;
        bytes4 signature;
    }

    mapping(bytes32 => TemplateInfo) public templates;
    uint256 nonce = 0;

    event Deployed(bytes32 templateName, bytes args);
    event TemplateAdded(
        bytes32 indexed templateName,
        address indexed templateAddr
    );
    event TemplateDeleted(
        bytes32 indexed templateName,
        address indexed templateAddr
    );

    /*
        External Interfaces
    */
    function deploySaleClone(
        bytes32 templateName_,
        bytes calldata args_
    ) external returns (address deployedAddr) {
        /* 1. Args must be non-empty and allowance is enough. */
        TemplateInfo memory templateInfo = templates[templateName_];
        address templateAddr = templateInfo.implemention;
        require(templateAddr != address(0), "No such template in the list.");

        /* 2. Make a clone. */
        deployedAddr = _createClone(templateAddr);

        /* 3. Initialize it. */
        (bool success, bytes memory data) = deployedAddr.call(
            bytes.concat(templateInfo.signature, args_)
        );
        require(success, "Failed to initialize the cloned contract.");
        (address tokenAddr, uint256 allocatedAmount) = abi.decode(
            data,
            (address, uint256)
        );

        /* 4. Fund it. */
        require(
            IERC20(tokenAddr).transferFrom(
                msg.sender,
                deployedAddr,
                allocatedAmount
            ),
            "TransferFrom failed."
        );

        emit Deployed(templateName_, args_);
    }

    function addTemplate(
        bytes32 templateName_,
        /* Dear governer; deploy it beforehand. */
        address templateAddr_,
        bytes4 signature_
    ) external onlyOwner {
        require(
            templates[templateName_].implemention == address(0),
            "This template name is already taken."
        );

        templates[templateName_] = TemplateInfo(templateAddr_, signature_);

        emit TemplateAdded(templateName_, templateAddr_);
    }

    function removeTemplate(bytes32 templateName_) external onlyOwner {
        TemplateInfo memory templateInfo = templates[templateName_];
        delete templates[templateName_];

        emit TemplateDeleted(templateName_, templateInfo.implemention);
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
