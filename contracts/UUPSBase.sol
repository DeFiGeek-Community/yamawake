// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title UUPSBase
/// @author DeFiGeek Community Japan
contract UUPSBase is UUPSUpgradeable {
    event CommitOwnership(address admin);
    event ApplyOwnership(address admin);

    address public admin;
    address public futureAdmin;

    function __UUPSBase_init() internal onlyInitializing {
        __UUPSBase_init_unchained();
    }

    function __UUPSBase_init_unchained() internal onlyInitializing {
        admin = msg.sender;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {}

    /***
     * @notice Transfer ownership of GaugeController to `addr`
     * @param addr_ Address to have ownership transferred to
     */
    function commitTransferOwnership(address addr_) external onlyAdmin {
        futureAdmin = addr_;
        emit CommitOwnership(addr_);
    }

    /***
     * @notice Apply pending ownership transfer
     */
    function applyTransferOwnership() external onlyAdmin {
        address _admin = futureAdmin;
        require(_admin != address(0), "admin not set");
        admin = _admin;
        emit ApplyOwnership(_admin);
    }

    modifier onlyAdmin() {
        require(admin == msg.sender, "admin only");
        _;
    }
}
