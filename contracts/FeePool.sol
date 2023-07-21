// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Feepool is Ownable {
    event WithdrawnEther(address indexed receiver, uint amount);

    event WithdrawnToken(
        address indexed receiver,
        address indexed token,
        uint amount
    );

    function withdrawEther(address to) external onlyOwner {
        require(to != address(0), "Don't discard treaury!");
        uint amount = address(this).balance;
        payable(to).transfer(amount);

        emit WithdrawnEther(to, amount);
    }

    function withdrawToken(
        address to,
        address[] calldata token
    ) external onlyOwner {
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
}