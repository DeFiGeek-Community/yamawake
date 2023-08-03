// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Feepool is Ownable {
    event WithdrawnEther(address indexed receiver, uint256 amount);

    event WithdrawnToken(
        address indexed receiver,
        address indexed token,
        uint256 amount
    );

    function withdrawEther(address to_) external onlyOwner {
        require(to_ != address(0), "Don't discard treaury!");
        uint256 amount = address(this).balance;
        payable(to_).transfer(amount);

        emit WithdrawnEther(to_, amount);
    }

    function withdrawToken(
        address to_,
        address[] calldata token_
    ) external onlyOwner {
        require(to_ != address(0), "Don't discard treaury!");
        uint256 length = token_.length;
        for (uint256 i; i < length; ) {
            uint256 amount = IERC20(token_[i]).balanceOf(address(this));
            IERC20(token_[i]).transfer(to_, amount);
            emit WithdrawnToken(to_, token_[i], amount);
            unchecked {
                i++;
            }
        }
    }
}
