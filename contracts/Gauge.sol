// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interfaces/IGaugeController.sol";
import "./interfaces/IYMWK.sol";
import "./interfaces/IMinter.sol";

struct Point {
    int128 bias;
    int128 slope;
    uint256 ts;
    uint256 blk;
}

interface IVotingEscrow {
    function userPointEpoch(address addr) external view returns (uint256);

    function epoch() external view returns (uint256);

    function userPointHistory(
        address addr,
        uint256 loc
    ) external view returns (Point memory);

    function pointHistory(uint256 loc) external view returns (Point memory);

    function checkpoint() external;
}

contract Gauge is ReentrancyGuard {
    event CheckpointToken(uint256 time, uint256 tokens);
    event CommitOwnership(address indexed admin);
    event ApplyOwnership(address indexed admin);

    // to avoid "stack too deep"
    struct CheckPointParameters {
        int128 period;
        uint256 periodTime;
        uint256 integrateInvSupply;
        uint256 inflationParams;
        uint256 rate;
        uint256 newRate;
        uint256 prevFutureEpoch;
        uint256 workingBalance;
        uint256 workingSupply;
    }

    // Constants
    uint256 public constant WEEK = 604800;
    uint256 public constant TOKEN_CHECKPOINT_DEADLINE = 86400;
    string public constant VERSION = "v1.0.0";

    // Gauge
    address public admin;
    address public token;
    address public votingEscrow;
    address public minter;
    address public gaugeController;

    bool public isKilled;

    uint256 public futureEpochTime;
    uint256 public inflationRate;
    uint256 public timeCursor;

    // user -> timestamp
    mapping(address => uint256) public timeCursorOf;

    // user -> user epoch
    mapping(address => uint256) public userEpochOf;

    uint256 public lastTokenTime;
    uint256 public tokenLastBalance;

    uint256[1000000000000000] public tokensPerWeek;

    mapping(uint256 => uint256) public veSupply; // VE total supply at week bounds
    // ∫(balance * rate(t) / totalSupply(t) dt) from 0 till checkpoint
    mapping(address => uint256) public integrateFraction;

    // The goal is to be able to calculate ∫(rate * balance / totalSupply dt) from 0 till checkpoint
    int128 public period;

    // Using dynamic array instead of fixed 100000000000000000000000000000 array to avoid warning about collisions
    uint256[100000000000000000000000000000] public periodTimestamp;
    uint256[100000000000000000000000000000] public integrateInvSupply;

    uint256 public immutable startTime;

    // TODO 以下変数削除

    // user -> [uint128 claimable amount][uint128 claimed amount]
    mapping(address => mapping(address => uint256)) public claimData;

    mapping(address => uint256) public workingBalances;
    uint256 public workingSupply;

    // 1e18 * ∫(rate(t) / totalSupply(t) dt) from (last_action) till checkpoint
    mapping(address => uint256) public integrateInvSupplyOf;
    mapping(address => uint256) public integrateCheckpointOf;

    /***
     * @notice Constructor
     * @param minter_
     */
    constructor(address minter_) {
        minter = minter_;
        token = IMinter(minter).token();
        gaugeController = IMinter(minter).controller();
        votingEscrow = IGaugeController(gaugeController).votingEscrow();

        periodTimestamp[0] = block.timestamp;
        admin = msg.sender;
        // uint256 _startTime = IYMWK(token).startEpochTime + RATE_REDUCTION_TIME;
        // startTime = (_startTime / WEEK) * WEEK;

        inflationRate = IYMWK(token).rate();
        futureEpochTime = IYMWK(token).futureEpochTimeWrite();

        startTime = (futureEpochTime / WEEK) * WEEK; // Distribution starts when YMWK inflation starts
    }

    /***
     * @notice
     * @dev
     */
    function _checkpointToken() internal {
        uint256 _tokenBalance = IERC20(token).balanceOf(address(this));
        uint256 _toDistribute = _tokenBalance - tokenLastBalance;
        tokenLastBalance = _tokenBalance;

        uint256 _t = lastTokenTime;
        uint256 _sinceLast = block.timestamp - _t;
        lastTokenTime = block.timestamp;
        uint256 _thisWeek = (_t / WEEK) * WEEK;
        uint256 _nextWeek = 0;

        for (uint256 i; i < 20; ) {
            _nextWeek = _thisWeek + WEEK;
            if (block.timestamp < _nextWeek) {
                if (_sinceLast == 0 && block.timestamp == _t) {
                    tokensPerWeek[_thisWeek] += _toDistribute;
                } else {
                    tokensPerWeek[_thisWeek] +=
                        (_toDistribute * (block.timestamp - _t)) /
                        _sinceLast;
                }
                break;
            } else {
                if (_sinceLast == 0 && _nextWeek == _t) {
                    tokensPerWeek[_thisWeek] += _toDistribute;
                } else {
                    tokensPerWeek[_thisWeek] +=
                        (_toDistribute * (_nextWeek - _t)) /
                        _sinceLast;
                }
            }
            _t = _nextWeek;
            _thisWeek = _nextWeek;
            unchecked {
                ++i;
            }
        }

        emit CheckpointToken(block.timestamp, _toDistribute);
    }

    /***
     * @notice Update the token checkpoint
     * @dev Calculates the total number of tokens to be distributed in a given week.
         During setup for the initial distribution this function is only callable
         by the contract owner. Beyond initial distro, it can be enabled for anyone
         to call.
     */
    function checkpointToken() external {
        require(
            msg.sender == admin || block.timestamp > lastTokenTime + 1 hours,
            "Unauthorized"
        );
        _checkpointToken();
    }

    function _findTimestampEpoch(
        address ve_,
        uint256 timestamp_
    ) internal view returns (uint256) {
        uint256 _min = 0;
        uint256 _max = IVotingEscrow(ve_).epoch();

        unchecked {
            for (uint256 i; i < 128; i++) {
                if (_min >= _max) {
                    break;
                }
                uint256 _mid = (_min + _max + 2) / 2;
                Point memory _pt = IVotingEscrow(ve_).pointHistory(_mid);
                if (_pt.ts <= timestamp_) {
                    _min = _mid;
                } else {
                    _max = _mid - 1;
                }
            }
        }
        return _min;
    }

    function _findTimestampUserEpoch(
        address ve_,
        address user_,
        uint256 timestamp_,
        uint256 maxUserEpoch_
    ) internal view returns (uint256) {
        uint256 _min = 0;
        uint256 _max = maxUserEpoch_;

        unchecked {
            for (uint256 i; i < 128; i++) {
                if (_min >= _max) {
                    break;
                }
                uint256 _mid = (_min + _max + 2) / 2;
                Point memory _pt = IVotingEscrow(ve_).userPointHistory(
                    user_,
                    _mid
                );
                if (_pt.ts <= timestamp_) {
                    _min = _mid;
                } else {
                    _max = _mid - 1;
                }
            }
        }
        return _min;
    }

    /***
     * @notice Get the veYNWK balance for `user_` at `timestamp_`
     * @param user_ Address to query balance for
     * @param timestamp_ Epoch time
     * @return uint256 veYNWK balance
     */
    function veForAt(
        address user_,
        uint256 timestamp_
    ) external view returns (uint256) {
        address _ve = votingEscrow;
        uint256 _maxUserEpoch = IVotingEscrow(_ve).userPointEpoch(user_);
        uint256 _epoch = _findTimestampUserEpoch(
            _ve,
            user_,
            timestamp_,
            _maxUserEpoch
        );
        Point memory _pt = IVotingEscrow(_ve).userPointHistory(user_, _epoch);
        int128 _balance = _pt.bias -
            _pt.slope *
            int128(int256(timestamp_ - _pt.ts));
        if (_balance < 0) {
            return 0;
        } else {
            return uint256(uint128(_balance));
        }
    }

    function _checkpointTotalSupply() internal {
        address _ve = votingEscrow;
        uint256 _t = timeCursor;
        uint256 _roundedTimestamp = (block.timestamp / WEEK) * WEEK;
        IVotingEscrow(_ve).checkpoint();

        for (uint256 i; i < 20; ) {
            if (_t > _roundedTimestamp) {
                break;
            } else {
                uint256 _epoch = _findTimestampEpoch(_ve, _t);
                Point memory _pt = IVotingEscrow(_ve).pointHistory(_epoch);
                int128 _dt = 0;
                if (_t > _pt.ts) {
                    _dt = int128(int256(_t) - int256(_pt.ts));
                }
                veSupply[_t] = uint256(int256(_pt.bias - _pt.slope * _dt));
                // TODO
                // Consider retrieve and save ralative weight here
                // uint256 w = IGaugeController(gaugeController)
                //    .gaugeRelativeWeight(address(this), (_t / WEEK) * WEEK);
                _t += WEEK;
            }
            unchecked {
                ++i;
            }
        }

        timeCursor = _t;
    }

    /***
     * @notice Update the veCRV total supply checkpoint
     * @dev The checkpoint is also updated by the first claimant each new epoch week. This function may be called independently of a claim, to reduce claiming gas costs.
     */
    function checkpointTotalSupply() external {
        _checkpointTotalSupply();
    }

    function _checkpoint(address addr_) internal {
        address ve = votingEscrow;
        // Minimal user_epoch is 0 (if user had no point)
        uint256 _userEpoch = 0;
        uint256 _toDistribute = 0;

        uint256 _maxUserEpoch = IVotingEscrow(ve).userPointEpoch(addr_);
        uint256 _startTime = startTime;

        if (_maxUserEpoch == 0) {
            // No lock = no fees
            return;
        }

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime;

        if (block.timestamp > _lastTokenTime + 1 hours) {
            _checkpointToken();
            _lastTokenTime = block.timestamp;
        }

        unchecked {
            _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        }

        uint256 _weekCursor = timeCursorOf[addr_];
        if (_weekCursor == 0) {
            // Need to do the initial binary search
            _userEpoch = _findTimestampUserEpoch(
                ve,
                addr_,
                _startTime,
                _maxUserEpoch
            );
        } else {
            _userEpoch = userEpochOf[addr_];
        }

        if (_userEpoch == 0) {
            _userEpoch = 1;
        }

        Point memory _userPoint = IVotingEscrow(ve).userPointHistory(
            addr_,
            _userEpoch
        );

        if (_weekCursor == 0) {
            _weekCursor = ((_userPoint.ts + WEEK - 1) / WEEK) * WEEK;
        }

        if (_weekCursor >= _lastTokenTime) {
            return;
        }

        if (_weekCursor < _startTime) {
            _weekCursor = _startTime;
        }

        Point memory _oldUserPoint = Point({bias: 0, slope: 0, ts: 0, blk: 0});

        // Iterate over weeks
        for (uint256 i; i < 50; ) {
            if (_weekCursor >= _lastTokenTime) {
                break;
            } else if (
                _weekCursor >= _userPoint.ts && _userEpoch <= _maxUserEpoch
            ) {
                _userEpoch += 1;
                _oldUserPoint = Point({
                    bias: _userPoint.bias,
                    slope: _userPoint.slope,
                    ts: _userPoint.ts,
                    blk: _userPoint.blk
                });
                if (_userEpoch > _maxUserEpoch) {
                    _userPoint = Point({bias: 0, slope: 0, ts: 0, blk: 0});
                } else {
                    _userPoint = IVotingEscrow(ve).userPointHistory(
                        addr_,
                        _userEpoch
                    );
                }
            } else {
                int256 _dt = int256(_weekCursor) - int256(_oldUserPoint.ts);
                int256 _balanceOf = int256(_oldUserPoint.bias) -
                    _dt *
                    int256(_oldUserPoint.slope);
                if (
                    int256(_oldUserPoint.bias) -
                        _dt *
                        int256(_oldUserPoint.slope) <
                    0
                ) {
                    _balanceOf = 0;
                }

                if (_balanceOf == 0 && _userEpoch > _maxUserEpoch) {
                    break;
                }
                if (_balanceOf > 0) {
                    uint256 w = IGaugeController(gaugeController)
                        .gaugeRelativeWeight(
                            address(this),
                            (_weekCursor / WEEK) * WEEK
                        );
                    _toDistribute +=
                        (uint256(_balanceOf) * tokensPerWeek[_weekCursor] * w) /
                        veSupply[_weekCursor] /
                        1e18;
                }
                _weekCursor += WEEK;
            }
            unchecked {
                ++i;
            }
        }

        _userEpoch = min(_maxUserEpoch, _userEpoch - 1);
        userEpochOf[addr_] = _userEpoch;
        timeCursorOf[addr_] = _weekCursor;

        integrateFraction[addr_] += _toDistribute;
        // integrateInvSupplyOf[addr_] = _st.integrateInvSupply;
        // integrateCheckpointOf[addr_] = block.timestamp;
    }

    function userCheckpoint(address addr_) external returns (bool) {
        require(
            msg.sender == addr_ || msg.sender == minter,
            "dev: unauthorized"
        );
        require(!isKilled, "Contract is killed");

        // uint256 _amount = _claim(_addr, _lastTokenTime);

        _checkpoint(addr_);
        return true;
    }

    function setKilled(bool isKilled_) external onlyAdmin {
        isKilled = isKilled_;
    }

    function claimableTokens(address addr_) external returns (uint256) {
        _checkpoint(addr_);
        return
            integrateFraction[addr_] -
            IMinter(minter).minted(addr_, address(this));
    }

    function integrateCheckpoint() external view returns (uint256) {
        return periodTimestamp[uint256(uint128(period))];
    }

    function version() external pure returns (string memory) {
        return VERSION;
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin);
        _;
    }
}
