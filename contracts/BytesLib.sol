// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.18;

library BytesLib {
    function toAddress(bytes20 b20) public pure returns (address) {
        uint160 i160 = uint160(b20);
        address addr = address(i160);
        return addr;
    }

    function toAddress(bytes memory bs) public pure returns (address) {
        uint start = 0;
        require(bs.length <= 20, "bytes more than 32 bytes cannot be uint160");
        uint160 x;
        assembly {
            x := mload(add(bs, add(0x20, start)))
        }
        return address(x);
    }
}
