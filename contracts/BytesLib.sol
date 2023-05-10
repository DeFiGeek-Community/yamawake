
pragma solidity ^0.8.3;
import "hardhat/console.sol";

/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Yamato
 * Copyright (C) 2021 Yamato Protocol (DeFiGeek Community Japan)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

library BytesLib {
    function toAddress (bytes20 b20) public pure returns (address) {
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
