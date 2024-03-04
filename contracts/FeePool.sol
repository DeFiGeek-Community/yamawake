// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FeePool
/// @author DeFiGeek Community Japan
/// @notice Receives and save fees sent by auctions
contract FeePool is Ownable {
    using SafeERC20 for IERC20;
    event WithdrawnEther(address indexed receiver, uint256 amount);
    event WithdrawnToken(
        address indexed receiver,
        address indexed token,
        uint256 amount
    );

    /// @notice Send ether to the spedcified address
    /// @param to_ Receiver's address
    function withdrawEther(address to_) external onlyOwner {
        require(to_ != address(0), "Don't discard treasury!");
        uint256 amount = address(this).balance;

        (bool success, ) = payable(to_).call{value: amount}("");
        require(success, "transfer failed");

        emit WithdrawnEther(to_, amount);
    }

    /// @notice Send tokens to the specified address
    /// @param to_ Receiver's address
    /// @param token_ Token addresses
    function withdrawToken(
        address to_,
        address[] calldata token_
    ) external onlyOwner {
        require(to_ != address(0), "Don't discard treasury!");
        uint256 length = token_.length;
        for (uint256 i; i < length; ) {
            uint256 amount = IERC20(token_[i]).balanceOf(address(this));
            IERC20(token_[i]).safeTransfer(to_, amount);
            emit WithdrawnToken(to_, token_[i], amount);
            unchecked {
                ++i;
            }
        }
    }

    receive() external payable {}
}
