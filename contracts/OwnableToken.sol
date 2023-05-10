pragma solidity ^0.8.3;

/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./ITemplateContract.sol";

/**
 * @author 0xMotoko
 * @title SampleToken
 * @notice No feature, for test.
 */
contract OwnableToken is ERC20, ITemplateContract {
    /*
        ==========================================
        === Template Idiom Declarations Begins ===
        ==========================================
    */
    bool initialized = false;

    address public constant factory = address(0x2c08D232cf190DcB7D641254ea5376a9DE17A882);

    /*
        You can't use constructor
        because the minimal proxy is really minimal.
        
        Proxy is minimal
        = no constructor
        = You can't access the Proxy constructor's SSTORE slot
        from implementation constructor's SLOAD slot.

        === DEFINE YOUR OWN ARGS BELOW ===

    */

    /* States in the deployment initialization */

    // none
    uint private _initialSupply;
    string private _name;
    string private _symbol;
    address public owner;

    /* States end */

    constructor() ERC20("-", "-") {
        // skip
    }

    function initialize(
        bytes memory abiBytes
    ) public override onlyOnce onlyFactory returns (bool) {
        /*
            We wanted to make it struct Args,
            but the string-containing-struct cannot be decoded by abi coder.
        */
        (
            uint _initialSupply_,
            string memory _name_,
            string memory _symbol_,
            address _owner_
        ) = abi.decode(abiBytes, (uint, string, string, address));

        require(bytes(_name_).length > 0, "name is empty");
        require(bytes(_symbol_).length > 0, "symbol is empty");
        require(_initialSupply_ > 0, "initialSupply is zero");

        _name = _name_;
        _symbol = _symbol_;
        _initialSupply = _initialSupply_;
        owner = _owner_;

        _mint(_owner_, _initialSupply_);

        emit Initialized(abiBytes);
        initialized = true;
        return true;
    }

    modifier onlyOnce() {
        require(!initialized, "This contract has already been initialized");
        _;
    }
    modifier onlyFactory() {
        require(msg.sender == factory, "You are not the Factory.");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "You are not the owner.");
        _;
    }

    /*
        ========================================
        === Template Idiom Declarations Ends ===
        ========================================
    */

    function approve(
        address spender,
        uint256 amount
    ) public virtual override returns (bool) {
        require(
            _msgSender() != spender,
            "sender and spender shouldn't be the same."
        );
        require(amount > 0, "Amount is zero.");

        _approve(_msgSender(), spender, amount);
        return true;
    }
}
