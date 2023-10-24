// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

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

contract FeeDistributor is ReentrancyGuard {
    uint256 public constant WEEK = 7 * 86400;
    uint256 public constant TOKEN_CHECKPOINT_DEADLINE = 86400;

    uint256 public startTime;
    uint256 public timeCursor;
    mapping(address => uint256) public timeCursorOf;
    mapping(address => uint256) public userEpochOf;

    uint256 public lastTokenTime;
    mapping(uint256 => uint256) public tokensPerWeek;

    address public votingEscrow;
    address public token;
    uint256 public totalReceived;
    uint256 public tokenLastBalance;

    mapping(uint256 => uint256) public veSupply; // VE total supply at week bounds

    address public admin;
    address public futureAdmin;
    bool public canCheckpointToken;
    address public emergencyReturn;
    bool public isKilled;

    event CommitAdmin(address indexed admin);
    event ApplyAdmin(address indexed admin);
    event ToggleAllowCheckpointToken(bool toggleFlag);
    event CheckpointToken(uint256 time, uint256 tokens);
    event Claimed(
        address indexed recipient,
        uint256 amount,
        uint256 claimEpoch,
        uint256 maxEpoch
    );

    /***
     * @notice Contract constructor
     * @param _voting_escrow VotingEscrow contract address
     * @param _start_time Epoch time for fee distribution to start
     * @param _token Fee token address (3CRV)
     * @param _admin Admin address
     * @param _emergency_return Address to transfer `_token` balance to if this contract is killed
     */
    constructor(
        address votingEscrow_,
        uint256 startTime_,
        address token_,
        address admin_,
        address emergencyReturn_
    ) {
        uint256 t = (startTime_ / WEEK) * WEEK;
        startTime = t;
        lastTokenTime = t;
        timeCursor = t;
        token = token_;
        votingEscrow = votingEscrow_;
        admin = admin_;
        emergencyReturn = emergencyReturn_;
    }

    function _checkpointToken() internal {
        uint256 _tokenBalance = IERC20(token).balanceOf(address(this));
        uint256 _toDistribute = _tokenBalance - tokenLastBalance;
        tokenLastBalance = _tokenBalance;

        uint256 t = lastTokenTime;
        uint256 sinceLast = block.timestamp - t;
        lastTokenTime = block.timestamp;
        uint256 thisWeek = (t / WEEK) * WEEK;
        uint256 nextWeek = 0;

        for (uint256 i = 0; i < 20; i++) {
            nextWeek = thisWeek + WEEK;
            if (block.timestamp < nextWeek) {
                if (sinceLast == 0 && block.timestamp == t) {
                    tokensPerWeek[thisWeek] += _toDistribute;
                } else {
                    tokensPerWeek[thisWeek] +=
                        (_toDistribute * (block.timestamp - t)) /
                        sinceLast;
                }
                break;
            } else {
                if (sinceLast == 0 && nextWeek == t) {
                    tokensPerWeek[thisWeek] += _toDistribute;
                } else {
                    tokensPerWeek[thisWeek] +=
                        (_toDistribute * (nextWeek - t)) /
                        sinceLast;
                }
            }
            t = nextWeek;
            thisWeek = nextWeek;
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
            msg.sender == admin ||
                (canCheckpointToken &&
                    block.timestamp > lastTokenTime + 1 hours),
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
        for (uint256 i = 0; i < 128; i++) {
            if (_min >= _max) {
                break;
            }
            uint256 _mid = (_min + _max + 2) / 2;
            Point memory pt = IVotingEscrow(ve_).pointHistory(_mid);
            if (pt.ts <= timestamp_) {
                _min = _mid;
            } else {
                _max = _mid - 1;
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
        for (uint256 i = 0; i < 128; i++) {
            if (_min >= _max) {
                break;
            }
            uint256 _mid = (_min + _max + 2) / 2;
            Point memory pt = IVotingEscrow(ve_).userPointHistory(user_, _mid);
            if (pt.ts <= timestamp_) {
                _min = _mid;
            } else {
                _max = _mid - 1;
            }
        }
        return _min;
    }

    /***
     * @notice Get the veCRV balance for `_user` at `_timestamp`
     * @param _user Address to query balance for
     * @param _timestamp Epoch time
     * @return uint256 veCRV balance
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
        Point memory pt = IVotingEscrow(_ve).userPointHistory(user_, _epoch);
        return
            uint256(
                int256(
                    pt.bias -
                        pt.slope *
                        int128(int256(timestamp_) - int256(pt.ts))
                )
            );
    }

    function _checkpointTotalSupply() internal {
        address _ve = votingEscrow;
        uint256 _t = timeCursor;
        uint256 _roundedTimestamp = (block.timestamp / WEEK) * WEEK;
        IVotingEscrow(_ve).checkpoint();

        for (uint256 i = 0; i < 20; i++) {
            if (_t > _roundedTimestamp) {
                break;
            } else {
                uint256 _epoch = _findTimestampEpoch(_ve, _t);
                Point memory pt = IVotingEscrow(_ve).pointHistory(_epoch);
                int128 dt = 0;
                if (_t > pt.ts) {
                    dt = int128(int256(_t) - int256(pt.ts));
                }
                veSupply[_t] = uint256(int256(pt.bias - pt.slope * dt));
                _t += WEEK;
            }
        }

        timeCursor = _t;
    }

    /***
     * @notice Update the veCRV total supply checkpoint
     * @dev The checkpoint is also updated by the first claimant each new epoch week. This function may be called independently of a claim, to reduce claiming gas costs.
     */
    function checkpointTotalSupply() external {
        address _ve = votingEscrow;
        uint256 _t = timeCursor;
        uint256 _roundedTimestamp = (block.timestamp / WEEK) * WEEK;
        IVotingEscrow(_ve).checkpoint();

        for (uint256 i = 0; i < 20; i++) {
            if (_t > _roundedTimestamp) {
                break;
            } else {
                uint256 epoch = _findTimestampEpoch(_ve, _t);
                Point memory pt = IVotingEscrow(_ve).pointHistory(epoch);
                uint256 dt = 0;
                if (_t > pt.ts) {
                    dt = uint256(int256(_t) - int256(pt.ts));
                }
                veSupply[_t] = uint256(
                    int256(
                        Math.max(
                            uint256(int256(pt.bias)) -
                                uint256(int256(pt.slope)) *
                                dt,
                            0
                        )
                    )
                );
            }
            _t += WEEK;
        }

        timeCursor = _t;
    }

    function _claim(
        address addr_,
        address ve_,
        uint256 lastTokenTime_
    ) internal returns (uint256) {
        // Minimal user_epoch is 0 (if user had no point)
        uint256 _userEpoch = 0;
        uint256 _toDistribute = 0;

        uint256 _maxUserEpoch = IVotingEscrow(ve_).userPointEpoch(addr_);
        uint256 _startTime = startTime;

        if (_maxUserEpoch == 0) {
            // No lock = no fees
            return 0;
        }

        uint256 weekCursor = timeCursorOf[addr_];
        if (weekCursor == 0) {
            // Need to do the initial binary search
            _userEpoch = _findTimestampUserEpoch(
                ve_,
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

        Point memory userPoint = IVotingEscrow(ve_).userPointHistory(
            addr_,
            _userEpoch
        );

        if (weekCursor == 0) {
            weekCursor = ((userPoint.ts + WEEK - 1) / WEEK) * WEEK;
        }

        if (weekCursor >= lastTokenTime_) {
            return 0;
        }

        if (weekCursor < _startTime) {
            weekCursor = _startTime;
        }

        Point memory oldUserPoint = Point({bias: 0, slope: 0, ts: 0, blk: 0});

        // Iterate over weeks
        for (uint256 i = 0; i < 50; i++) {
            if (weekCursor >= lastTokenTime_) {
                break;
            } else if (
                weekCursor >= userPoint.ts && _userEpoch <= _maxUserEpoch
            ) {
                _userEpoch += 1;
                oldUserPoint = userPoint;
                if (_userEpoch > _maxUserEpoch) {
                    userPoint = Point({bias: 0, slope: 0, ts: 0, blk: 0});
                } else {
                    userPoint = IVotingEscrow(ve_).userPointHistory(
                        addr_,
                        _userEpoch
                    );
                }
            } else {
                uint256 dt = uint256(
                    int256(weekCursor) - int256(oldUserPoint.ts)
                );
                uint256 balanceOf = uint256(
                    int256(
                        Math.max(
                            uint256(int256(oldUserPoint.bias)) -
                                dt *
                                uint256(int256(oldUserPoint.slope)),
                            0
                        )
                    )
                );
                if (balanceOf == 0 && _userEpoch > _maxUserEpoch) {
                    break;
                }
                if (balanceOf > 0) {
                    _toDistribute +=
                        (balanceOf * tokensPerWeek[weekCursor]) /
                        veSupply[weekCursor];
                }
                weekCursor += WEEK;
            }
        }

        _userEpoch = Math.min(_maxUserEpoch, _userEpoch - 1);
        userEpochOf[addr_] = _userEpoch;
        timeCursorOf[addr_] = weekCursor;

        emit Claimed(addr_, _toDistribute, _userEpoch, _maxUserEpoch);

        return _toDistribute;
    }

    /***
     * @notice @notice Claim fees for `addr_`
     * @dev Each call to claim look at a maximum of 50 user veCRV points.
         For accounts with many veCRV related actions, this function
         may need to be called more than once to claim all available
         fees. In the `Claimed` event that fires, if `claim_epoch` is
         less than `max_epoch`, the account may claim again.
     * @param addr_ Address to claim fees for
     * @return uint256 Amount of fees claimed in the call
     */
    function claim(address addr_) external nonReentrant returns (uint256) {
        require(!isKilled, "Contract is killed");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime;

        if (
            canCheckpointToken && (block.timestamp > _lastTokenTime + 1 hours)
        ) {
            _checkpointToken();
            _lastTokenTime = block.timestamp;
        }

        _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;

        uint256 amount = _claim(addr_, votingEscrow, _lastTokenTime);
        if (amount != 0) {
            require(IERC20(token).transfer(addr_, amount), "Transfer failed");
            tokenLastBalance -= amount;
        }

        return amount;
    }

    /***
     * @notice Make multiple fee claims in a single call
     * @dev Used to claim for many accounts at once, or to make
         multiple claims for the same address when that address
         has significant veCRV history
     * @param receivers_ List of addresses to claim for. Claiming
                      terminates at the first `ZERO_ADDRESS`.
     * @return bool success
     */
    function claimMany(
        address[] memory receivers_
    ) external nonReentrant returns (bool) {
        require(!isKilled, "Contract is killed");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime;

        if (
            canCheckpointToken && (block.timestamp > _lastTokenTime + 1 hours)
        ) {
            _checkpointToken();
            _lastTokenTime = block.timestamp;
        }

        _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        uint256 total = 0;

        for (uint256 i = 0; i < receivers_.length; i++) {
            address addr = receivers_[i];
            if (addr == address(0)) {
                break;
            }

            uint256 amount = _claim(addr, votingEscrow, _lastTokenTime);
            if (amount != 0) {
                require(
                    IERC20(token).transfer(addr, amount),
                    "Transfer failed"
                );
                total += amount;
            }
        }

        if (total != 0) {
            tokenLastBalance -= total;
        }

        return true;
    }

    /***
     * @notice Receive 3CRV into the contract and trigger a token checkpoint
     * @param coin_ Address of the coin being received (must be 3CRV)
     * @return bool success
     */
    function burn(address coin_) external returns (bool) {
        require(coin_ == address(token), "Invalid token");
        require(!isKilled, "Contract is killed");

        uint256 _amount = IERC20(token).balanceOf(msg.sender);
        if (_amount > 0) {
            IERC20(token).transferFrom(msg.sender, address(this), _amount);
            if (
                canCheckpointToken && block.timestamp > lastTokenTime + 1 hours
            ) {
                _checkpointToken();
            }
        }
        return true;
    }

    /***
     * @notice Commit transfer of ownership
     * @param addr_ New admin address
     */
    function commitAdmin(address addr_) external {
        require(msg.sender == admin, "Access denied");
        futureAdmin = addr_;
        emit CommitAdmin(addr_);
    }

    /***
     * @notice Apply transfer of ownership
     */
    function applyAdmin() external {
        require(msg.sender == admin, "Access denied");
        require(futureAdmin != address(0), "No admin set");
        admin = futureAdmin;
        emit ApplyAdmin(futureAdmin);
    }

    /***
     * @notice Toggle permission for checkpointing by any account
     */
    function toggleAllowCheckpointToken() external {
        require(msg.sender == admin, "Access denied");
        canCheckpointToken = !canCheckpointToken;
        emit ToggleAllowCheckpointToken(canCheckpointToken);
    }

    /***
     * @notice Kill the contract
     * @dev Killing transfers the entire 3CRV balance to the emergency return address
         and blocks the ability to claim or burn. The contract cannot be unkilled.
     */
    function killMe() external {
        require(msg.sender == admin, "Access denied");
        isKilled = true;
        require(
            IERC20(token).transfer(
                emergencyReturn,
                IERC20(token).balanceOf(address(this))
            ),
            "Transfer failed"
        );
    }

    /***
     * @notice Recover ERC20 tokens from this contract
     * @dev Tokens are sent to the emergency return address.
     * @param coin_ Token address
     * @return bool success
     */
    function recoverBalance(address coin_) external returns (bool) {
        require(msg.sender == admin, "Access denied");
        require(coin_ != address(token), "Cannot recover this token");

        uint256 amount = IERC20(coin_).balanceOf(address(this));
        require(
            IERC20(coin_).transfer(emergencyReturn, amount),
            "Transfer failed"
        );
        return true;
    }
}
