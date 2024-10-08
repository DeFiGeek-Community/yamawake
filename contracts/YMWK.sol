// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Yamawake DAO Token
/// @author DeFiGeek Community Japan
/// @notice ERC20 with piecewise-linear mining supply.
contract YMWK is ERC20 {
    event UpdateMiningParameters(uint256 time, uint256 rate, uint256 supply);
    event SetMinter(address minter);
    event SetAdmin(address admin);

    address public minter;
    address public admin;

    // General constants
    uint256 constant YEAR = 365 days;

    // Supply parameters
    uint256 constant INITIAL_SUPPLY = 450_000_000;
    uint256 constant INITIAL_RATE = (55_000_000 * 10 ** 18) / YEAR; // leading to 45% premine
    uint256 constant RATE_REDUCTION_TIME = YEAR;
    uint256 constant RATE_REDUCTION_COEFFICIENT = 1_111_111_111_111_111_111; // 10 * 1e18 / 9
    uint256 constant RATE_DENOMINATOR = 10 ** 18;
    uint256 constant INFLATION_DELAY = YEAR;

    // Supply variables
    int128 public miningEpoch;
    uint256 public startEpochTime;
    uint256 public rate;

    uint256 startEpochSupply;

    constructor() ERC20("Yamawake DAO Token", "YMWK") {
        uint256 _initSupply = INITIAL_SUPPLY * 10 ** decimals();
        _mint(msg.sender, _initSupply);

        admin = msg.sender;

        startEpochTime =
            block.timestamp +
            INFLATION_DELAY -
            RATE_REDUCTION_TIME;
        miningEpoch = -1;
        rate = 0;
        startEpochSupply = _initSupply;
    }

    // @dev Update mining rate and supply at the start of the epoch
    //      Any modifying mining call must also call this
    function _updateMiningParameters() internal {
        uint256 _rate = rate;
        uint256 _startEpochSupply = startEpochSupply;

        startEpochTime += RATE_REDUCTION_TIME;
        miningEpoch += 1;

        if (_rate == 0) {
            _rate = INITIAL_RATE;
        } else {
            _startEpochSupply += _rate * RATE_REDUCTION_TIME;
            startEpochSupply = _startEpochSupply;
            _rate = (_rate * RATE_DENOMINATOR) / RATE_REDUCTION_COEFFICIENT;
        }

        rate = _rate;

        emit UpdateMiningParameters(block.timestamp, _rate, _startEpochSupply);
    }

    // @notice Update mining rate and supply at the start of the epoch
    // @dev Callable by any address, but only once per epoch
    //      Total supply becomes slightly larger if(this function is called late
    function updateMiningParameters() external {
        require(
            block.timestamp >= startEpochTime + RATE_REDUCTION_TIME,
            "dev: too soon!"
        );
        _updateMiningParameters();
    }

    // @notice Get timestamp of the current mining epoch start
    //         while simultaneously updating mining parameters
    // @return Timestamp of the epoch
    function startEpochTimeWrite() external returns (uint256) {
        uint256 _startEpochTime = startEpochTime;
        if (block.timestamp >= _startEpochTime + RATE_REDUCTION_TIME) {
            _updateMiningParameters();
            return startEpochTime;
        } else {
            return _startEpochTime;
        }
    }

    // @notice Get timestamp of the next mining epoch start
    //         while simultaneously updating mining parameters
    // @return Timestamp of the next epoch
    function futureEpochTimeWrite() external returns (uint256) {
        uint256 _startEpochTime = startEpochTime;
        if (block.timestamp >= _startEpochTime + RATE_REDUCTION_TIME) {
            _updateMiningParameters();
            return startEpochTime + RATE_REDUCTION_TIME;
        } else {
            return _startEpochTime + RATE_REDUCTION_TIME;
        }
    }

    function _availableSupply() internal view returns (uint256) {
        return startEpochSupply + (block.timestamp - startEpochTime) * rate;
    }

    // @notice Current number of tokens in existence (claimed or unclaimed)
    function availableSupply() external view returns (uint256) {
        return _availableSupply();
    }

    // @notice How much supply is mintable from start timestamp till end timestamp
    // @param start Start of the time interval (timestamp)
    // @param end End of the time interval (timestamp)
    // @return Tokens mintable from `start` till `end`
    function mintableInTimeframe(
        uint256 start,
        uint256 end
    ) external view returns (uint256) {
        require(start <= end, "dev: start > end");
        uint256 _toMint = 0;
        uint256 _currentEpochTime = startEpochTime;
        uint256 _currentRate = rate;

        // Special case if(end is in future (not yet minted) epoch
        if (end > _currentEpochTime + RATE_REDUCTION_TIME) {
            _currentEpochTime += RATE_REDUCTION_TIME;
            _currentRate =
                (_currentRate * RATE_DENOMINATOR) /
                RATE_REDUCTION_COEFFICIENT;
        }

        require(
            end <= _currentEpochTime + RATE_REDUCTION_TIME,
            "dev: too far in future"
        );

        // Yamawake will not work in 1000 years. Darn!
        for (uint i; i < 999; ) {
            if (end >= _currentEpochTime) {
                uint256 current_end = end;
                if (current_end > _currentEpochTime + RATE_REDUCTION_TIME) {
                    current_end = _currentEpochTime + RATE_REDUCTION_TIME;
                }

                uint256 current_start = start;
                if (current_start >= _currentEpochTime + RATE_REDUCTION_TIME) {
                    break; // We should never get here but what if...
                } else if (current_start < _currentEpochTime) {
                    current_start = _currentEpochTime;
                }
                _toMint += _currentRate * (current_end - current_start);
                if (start >= _currentEpochTime) {
                    break;
                }
            }

            _currentEpochTime -= RATE_REDUCTION_TIME;
            _currentRate =
                (_currentRate * RATE_REDUCTION_COEFFICIENT) /
                RATE_DENOMINATOR; // double-division with rounding made rate a bit less => good
            require(_currentRate <= INITIAL_RATE, "This should never happen");

            unchecked {
                i++;
            }
        }

        return _toMint;
    }

    // @notice Set the minter address
    // @dev Only callable once, when minter has not yet been set
    // @param _minter Address of the minter
    function setMinter(address _minter) external onlyAdmin {
        require(
            minter == address(0),
            "dev: can set the minter only once, at creation"
        );
        minter = _minter;
        emit SetMinter(_minter);
    }

    // @notice Set the new admin.
    // @dev After all is set up, admin only can change the token name
    // @param _admin New admin address
    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
        emit SetAdmin(_admin);
    }

    // @notice Mint `_value` tokens and assign them to `_to`
    // @dev Emits a Transfer event originating from 0x00
    // @param _to The account that will receive the created tokens
    // @param _value The amount that will be created
    // @return bool success
    function mint(address _to, uint256 _value) external returns (bool) {
        require(msg.sender == minter, "dev: minter only");
        require(_to != address(0), "dev: zero address");

        if (block.timestamp >= startEpochTime + RATE_REDUCTION_TIME) {
            _updateMiningParameters();
        }

        require(
            totalSupply() + _value <= _availableSupply(),
            "dev: exceeds allowable mint amount"
        );

        _mint(_to, _value);

        return true;
    }

    // @notice Burn `_value` tokens belonging to `msg.sender`
    // @dev Emits a Transfer event with a destination of 0x00
    // @param _value The amount that will be burned
    // @return bool success
    function burn(uint256 _value) external returns (bool) {
        _burn(msg.sender, _value);
        return true;
    }

    modifier onlyAdmin() {
        require(admin == msg.sender, "dev: admin only");
        _;
    }
}
