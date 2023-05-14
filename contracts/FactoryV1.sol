// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ISaleTemplateV1.sol";

contract FactoryV1 is ReentrancyGuard, Ownable {
    mapping(bytes32 => address) public templates;
    uint nonce = 0;

    event Deployed(
        address indexed sender,
        bytes32 indexed templateName,
        address indexed deployedAddr,
        bytes abiArgs
    );
    event TemplateAdded(
        bytes32 indexed templateName,
        address indexed templateAddr
    );
    event TemplateDeleted(bytes32 indexed templateName);
    event WithdrawnEther(address indexed receiver, uint amount);
    event WithdrawnToken(
        address indexed receiver,
        address indexed token,
        uint amount
    );

    /*
        External Interfaces
    */
    function deploySaleClone(
        bytes32 templateName,
        address tokenAddr,
        uint distributeAmount,
        bytes calldata abiArgs
    ) public nonReentrant returns (address deployedAddr) {
        /* 1. Args must be non-empty and allowance is enough. */
        address templateAddr = templates[templateName];
        require(templateAddr != address(0), "No such template in the list.");

        require(tokenAddr != address(0), "Go with non null address.");

        require(
            distributeAmount > 0,
            "Having an event without tokens are not permitted."
        );

        /* 2. Make a clone. */
        deployedAddr = _createClone(templateAddr);

        /* 3. Fund it. */
        require(
            IERC20(tokenAddr).transferFrom(
                msg.sender,
                deployedAddr,
                distributeAmount
            ),
            "TransferFrom failed."
        );

        /* 4. Initialize it. */
        require(
            ISaleTemplateV1(deployedAddr).initialize(distributeAmount, abiArgs),
            "Failed to initialize the cloned contract."
        );

        emit Deployed(msg.sender, templateName, deployedAddr, abiArgs);
    }

    function addTemplate(
        bytes32 templateName,
        /* Dear governer; deploy it beforehand. */
        address templateAddr
    ) external onlyOwner {
        require(
            templates[templateName] == address(0),
            "This template name is already taken."
        );
        templates[templateName] = templateAddr;
        emit TemplateAdded(templateName, templateAddr);
    }

    function removeTemplate(bytes32 templateName) external onlyOwner {
        templates[templateName] = address(0);
        emit TemplateDeleted(templateName);
    }

    receive() external payable {}

    function withdrawEther(address to) external onlyOwner nonReentrant {
        require(to != address(0), "Don't discard treaury!");
        uint amount = address(this).balance;
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "transfer failed");

        emit WithdrawnEther(to, amount);
    }

    function withdrawToken(
        address to,
        address[] calldata token
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Don't discard treaury!");
        uint length = token.length;
        for (uint i; i < length; ) {
            uint amount = IERC20(token[i]).balanceOf(address(this));
            IERC20(token[i]).transfer(to, amount);
            emit WithdrawnToken(to, token[i], amount);
            unchecked {
                i++;
            }
        }
    }

    /*
        Internal Helpers
    */
    function _createClone(
        address implementation
    ) internal returns (address result) {
        nonce += 1;
        bytes32 salt = keccak256(abi.encodePacked(implementation, nonce));
        // OpenZeppelin Contracts (last updated v4.8.0) (proxy/Clones.sol)
        assembly {
            mstore(
                0x00,
                or(
                    shr(0xe8, shl(0x60, implementation)),
                    0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000
                )
            )
            mstore(
                0x20,
                or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3)
            )
            result := create2(0, 0x09, 0x37, salt)
        }
        require(result != address(0), "ERC1167: create2 failed");
    }
}
