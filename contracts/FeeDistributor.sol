// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./interfaces/IVotingEscrow.sol";

interface IFactory {
    function auctions(address _address) external view returns (bool);
}

contract FeeDistributor is ReentrancyGuard {
    uint256 public constant WEEK = 7 * 86400;
    uint256 public constant TOKEN_CHECKPOINT_DEADLINE = 86400;

    address public immutable factory;
    uint256 public startTime;
    uint256 public timeCursor;
    mapping(address => mapping(address => uint256)) public timeCursorOf; // user -> token -> timestamp
    mapping(address => mapping(address => uint256)) public userEpochOf; // user -> token -> epoch

    mapping(address => uint256) public lastTokenTime;
    mapping(address => uint256[1000000000000000]) public tokensPerWeek; // token -> week(timestamp) -> amount

    address public votingEscrow;
    address[] public tokens;
    mapping(address => bool) public tokenFlags;

    // uint256 public totalReceived;
    mapping(address => uint256) public tokenLastBalance; // token -> balance

    mapping(uint256 => uint256) public veSupply; // VE total supply at week bounds

    address public admin;
    address public futureAdmin;
    bool public canCheckpointToken;
    address public emergencyReturn;
    bool public isKilled;

    struct ClaimParams {
        uint256 userEpoch;
        uint256 toDistribute;
        uint256 maxUserEpoch;
        uint256 startTime;
        uint256 thisWeek;
        uint256 lastTokenTime;
        uint256 latestFeeUnlockTime;
    }

    struct RewardParams {
        int256 dt;
        int256 balanceOf;
        uint256 tokensPerWeek;
    }

    event CommitAdmin(address indexed admin);
    event ApplyAdmin(address indexed admin);
    event ToggleAllowCheckpointToken(bool toggleFlag);
    event CheckpointToken(address indexed token, uint256 time, uint256 tokens);
    event Claimed(
        address indexed recipient,
        uint256 amount,
        uint256 claimEpoch,
        uint256 maxEpoch
    );
    event AddedToken(address indexed token);

    /***
     * @notice Contract constructor
     * @param votingEscrow_ VotingEscrow contract address
     * @param factory_ Auction Factory contract address
     * @param startTime_ Epoch time for fee distribution to start
     * @param admin_ Admin address
     * @param emergencyReturn_ Address to transfer `_token` balance to if this contract is killed
     */
    constructor(
        address votingEscrow_,
        address factory_,
        uint256 startTime_,
        address admin_,
        address emergencyReturn_
    ) {
        uint256 t = (startTime_ / WEEK) * WEEK;
        startTime = t;
        lastTokenTime[address(0)] = t;
        timeCursor = t;
        tokens.push(address(0));
        tokenFlags[address(0)] = true;
        votingEscrow = votingEscrow_;
        factory = factory_;
        admin = admin_;
        emergencyReturn = emergencyReturn_;
    }

    function _checkpointToken(address token_) internal {
        uint256 _tokenBalance;
        if (token_ == address(0)) {
            _tokenBalance = address(this).balance;
        } else {
            _tokenBalance = IERC20(token_).balanceOf(address(this));
        }
        uint256 _toDistribute = _tokenBalance - tokenLastBalance[token_];
        tokenLastBalance[token_] = _tokenBalance;

        uint256 _t = lastTokenTime[token_];
        uint256 _sinceLast = block.timestamp - _t;
        uint256 _sinceLastInWeeks = _sinceLast / WEEK;

        // 前回のチェックポイントから週をまたいでいる場合は_tを前回のチェックポイントの翌週頭に設定する
        if (_sinceLastInWeeks > 0) {
            _t = ((_t + WEEK) / WEEK) * WEEK;
            _sinceLast = block.timestamp - _t;
            _sinceLastInWeeks = _sinceLast / WEEK;
        }
        // _sinceLastが20週間以上経過している場合は_tを現在のブロックタイムから19週間前に設定
        if (_sinceLastInWeeks >= 20) {
            _t = ((block.timestamp - (WEEK * 19)) / WEEK) * WEEK;
            _sinceLast = block.timestamp - _t;
        }

        lastTokenTime[token_] = block.timestamp;
        uint256 _thisWeek = (_t / WEEK) * WEEK;
        uint256 _nextWeek = 0;

        for (uint256 i; i < 20; ) {
            _nextWeek = _thisWeek + WEEK;
            if (block.timestamp < _nextWeek) {
                if (_sinceLast == 0 && block.timestamp == _t) {
                    tokensPerWeek[token_][_thisWeek] += _toDistribute;
                } else {
                    tokensPerWeek[token_][_thisWeek] +=
                        (_toDistribute * (block.timestamp - _t)) /
                        _sinceLast;
                }
                break;
            } else {
                if (_sinceLast == 0 && _nextWeek == _t) {
                    tokensPerWeek[token_][_thisWeek] += _toDistribute;
                } else {
                    tokensPerWeek[token_][_thisWeek] +=
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

        emit CheckpointToken(token_, block.timestamp, _toDistribute);
    }

    /***
     * @notice Update the token checkpoint
     * @dev Calculates the total number of tokens to be distributed in a given week.
         During setup for the initial distribution this function is only callable
         by the contract owner. Beyond initial distro, it can be enabled for anyone
         to call.
     */
    function checkpointToken(address token_) external {
        require(tokenFlags[token_], "Token not registered");
        require(
            msg.sender == admin ||
                IFactory(factory).auctions(msg.sender) ||
                (canCheckpointToken &&
                    block.timestamp >
                    lastTokenTime[token_] + TOKEN_CHECKPOINT_DEADLINE),
            "Unauthorized"
        );
        _checkpointToken(token_);
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
                IVotingEscrow.Point memory _pt = IVotingEscrow(ve_)
                    .pointHistory(_mid);
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
                IVotingEscrow.Point memory _pt = IVotingEscrow(ve_)
                    .userPointHistory(user_, _mid);
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
        IVotingEscrow.Point memory _pt = IVotingEscrow(_ve).userPointHistory(
            user_,
            _epoch
        );
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
                IVotingEscrow.Point memory _pt = IVotingEscrow(_ve)
                    .pointHistory(_epoch);
                int128 _dt = 0;
                if (_t > _pt.ts) {
                    _dt = int128(int256(_t) - int256(_pt.ts));
                }
                veSupply[_t] = uint256(int256(_pt.bias - _pt.slope * _dt));
                _t += WEEK;
            }
            unchecked {
                ++i;
            }
        }

        timeCursor = _t;
    }

    /***
     * @notice Update the veYMWK total supply checkpoint
     * @dev The checkpoint is also updated by the first claimant each new epoch week. This function may be called independently of a claim, to reduce claiming gas costs.
     */
    function checkpointTotalSupply() external {
        _checkpointTotalSupply();
    }

    function _claim(
        address addr_,
        address token_,
        address ve_,
        uint256 lastTokenTime_
    ) internal returns (uint256) {
        // Minimal user_epoch is 0 (if user had no point)
        ClaimParams memory _cp = ClaimParams({
            userEpoch: 0,
            toDistribute: 0,
            maxUserEpoch: IVotingEscrow(ve_).userPointEpoch(addr_),
            startTime: startTime,
            thisWeek: (block.timestamp / WEEK) * WEEK,
            lastTokenTime: lastTokenTime_,
            latestFeeUnlockTime: ((lastTokenTime_ + WEEK) / WEEK) * WEEK
        });

        if (_cp.thisWeek >= _cp.latestFeeUnlockTime) {
            _cp.lastTokenTime = _cp.latestFeeUnlockTime;
        }

        if (_cp.maxUserEpoch == 0) {
            // No lock = no fees
            return 0;
        }

        uint256 _weekCursor = timeCursorOf[addr_][token_];
        if (_weekCursor == 0) {
            // Need to do the initial binary search
            _cp.userEpoch = _findTimestampUserEpoch(
                ve_,
                addr_,
                _cp.startTime,
                _cp.maxUserEpoch
            );
        } else {
            _cp.userEpoch = userEpochOf[addr_][token_];
        }

        if (_cp.userEpoch == 0) {
            _cp.userEpoch = 1;
        }

        IVotingEscrow.Point memory _userPoint = IVotingEscrow(ve_)
            .userPointHistory(addr_, _cp.userEpoch);

        if (_weekCursor == 0) {
            _weekCursor = ((_userPoint.ts + WEEK - 1) / WEEK) * WEEK;
        }

        if (_weekCursor >= _cp.lastTokenTime) {
            return 0;
        }

        if (_weekCursor < _cp.startTime) {
            _weekCursor = _cp.startTime;
        }

        IVotingEscrow.Point memory _oldUserPoint = IVotingEscrow.Point({
            bias: 0,
            slope: 0,
            ts: 0,
            blk: 0
        });

        // Iterate over weeks
        for (uint256 i; i < 50; ) {
            if (_weekCursor >= _cp.lastTokenTime) {
                break;
            } else if (
                _weekCursor >= _userPoint.ts &&
                _cp.userEpoch <= _cp.maxUserEpoch
            ) {
                _cp.userEpoch += 1;
                _oldUserPoint = IVotingEscrow.Point({
                    bias: _userPoint.bias,
                    slope: _userPoint.slope,
                    ts: _userPoint.ts,
                    blk: _userPoint.blk
                });
                if (_cp.userEpoch > _cp.maxUserEpoch) {
                    _userPoint = IVotingEscrow.Point({
                        bias: 0,
                        slope: 0,
                        ts: 0,
                        blk: 0
                    });
                } else {
                    _userPoint = IVotingEscrow(ve_).userPointHistory(
                        addr_,
                        _cp.userEpoch
                    );
                }
            } else {
                RewardParams memory _rp = RewardParams({
                    dt: int256(_weekCursor) - int256(_oldUserPoint.ts),
                    balanceOf: 0,
                    tokensPerWeek: 0
                });
                _rp.balanceOf =
                    int256(_oldUserPoint.bias) -
                    _rp.dt *
                    int256(_oldUserPoint.slope);

                if (_rp.balanceOf < 0) {
                    _rp.balanceOf = 0;
                }

                if (_rp.balanceOf == 0 && _cp.userEpoch > _cp.maxUserEpoch) {
                    break;
                }
                if (_rp.balanceOf > 0) {
                    _rp.tokensPerWeek = tokensPerWeek[token_][_weekCursor];
                    _cp.toDistribute +=
                        (uint256(_rp.balanceOf) * _rp.tokensPerWeek) /
                        veSupply[_weekCursor];
                }
                _weekCursor += WEEK;
            }
            unchecked {
                ++i;
            }
        }

        _cp.userEpoch = Math.min(_cp.maxUserEpoch, _cp.userEpoch - 1);
        userEpochOf[addr_][token_] = _cp.userEpoch;
        timeCursorOf[addr_][token_] = _weekCursor;

        emit Claimed(addr_, _cp.toDistribute, _cp.userEpoch, _cp.maxUserEpoch);

        return _cp.toDistribute;
    }

    /***
     * @notice Claim fees for `msg.sender`
     * @dev Each call to claim look at a maximum of 50 user veYMWK points.
         For accounts with many veYMWK related actions, this function
         may need to be called more than once to claim all available
         fees. In the `Claimed` event that fires, if `claim_epoch` is
         less than `max_epoch`, the account may claim again.
     * @return uint256 Amount of fees claimed in the call
     */
    function claim(address token_) external nonReentrant returns (uint256) {
        require(!isKilled, "Contract is killed");
        address _addr = msg.sender;
        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime[token_];

        if (
            canCheckpointToken &&
            (block.timestamp > _lastTokenTime + TOKEN_CHECKPOINT_DEADLINE)
        ) {
            _checkpointToken(token_);
            _lastTokenTime = block.timestamp;
        }

        unchecked {
            _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        }

        uint256 _amount = _claim(_addr, token_, votingEscrow, _lastTokenTime);
        if (_amount != 0) {
            tokenLastBalance[token_] -= _amount;
            if (token_ == address(0)) {
                require(payable(_addr).send(_amount), "Transfer failed");
            } else {
                require(
                    IERC20(token_).transfer(_addr, _amount),
                    "Transfer failed"
                );
            }
        }

        return _amount;
    }

    /***
     * @notice Claim fees for `addr_`
     * @dev Each call to claim look at a maximum of 50 user veYMWK points.
         For accounts with many veYMWK related actions, this function
         may need to be called more than once to claim all available
         fees. In the `Claimed` event that fires, if `claim_epoch` is
         less than `max_epoch`, the account may claim again.
     * @param addr_ Address to claim fees for
     * @return uint256 Amount of fees claimed in the call
     */
    function claim(
        address addr_,
        address token_
    ) external nonReentrant returns (uint256) {
        require(!isKilled, "Contract is killed");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime[token_];

        if (
            canCheckpointToken &&
            (block.timestamp > _lastTokenTime + TOKEN_CHECKPOINT_DEADLINE)
        ) {
            _checkpointToken(token_);
            _lastTokenTime = block.timestamp;
        }

        unchecked {
            _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        }

        uint256 _amount = _claim(addr_, token_, votingEscrow, _lastTokenTime);
        if (_amount != 0) {
            tokenLastBalance[token_] -= _amount;
            if (token_ == address(0)) {
                require(payable(addr_).send(_amount), "Transfer failed");
            } else {
                require(
                    IERC20(token_).transfer(addr_, _amount),
                    "Transfer failed"
                );
            }
        }

        return _amount;
    }

    /***
     * @notice Make multiple fee claims in a single call
     * @dev Used to claim for many accounts at once, or to make
         multiple claims for the same address when that address
         has significant veYMWK history
     * @param receivers_ List of addresses to claim for. Claiming
                      terminates at the first `ZERO_ADDRESS`.
     * @return bool success
     */
    function claimMany(
        address[20] memory receivers_,
        address token_
    ) external nonReentrant returns (bool) {
        require(!isKilled, "Contract is killed");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime[token_];

        if (
            canCheckpointToken &&
            (block.timestamp > _lastTokenTime + TOKEN_CHECKPOINT_DEADLINE)
        ) {
            _checkpointToken(token_);
            _lastTokenTime = block.timestamp;
        }

        unchecked {
            _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        }

        uint256 _total = 0;
        uint256 _l = receivers_.length;
        for (uint256 i; i < _l; ) {
            address _addr = receivers_[i];
            if (_addr == address(0)) {
                break;
            }

            uint256 _amount = _claim(
                _addr,
                token_,
                votingEscrow,
                _lastTokenTime
            );
            if (_amount != 0) {
                _total += _amount;
                if (token_ == address(0)) {
                    require(payable(_addr).send(_amount), "Transfer failed");
                } else {
                    require(
                        IERC20(token_).transfer(_addr, _amount),
                        "Transfer failed"
                    );
                }
            }
            unchecked {
                ++i;
            }
        }

        if (_total != 0) {
            tokenLastBalance[token_] -= _total;
        }

        return true;
    }

    function claimMultipleTokens(
        address addr_,
        address[20] memory tokens_
    ) external nonReentrant returns (bool) {
        require(!isKilled, "Contract is killed");
        require(addr_ != address(0), "Address should not zero");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _l = tokens_.length;
        for (uint256 i; i < _l; ) {
            address _token = tokens_[i];
            uint256 _lastTokenTime = lastTokenTime[_token];

            if (
                canCheckpointToken &&
                (block.timestamp > _lastTokenTime + TOKEN_CHECKPOINT_DEADLINE)
            ) {
                _checkpointToken(_token);
                _lastTokenTime = block.timestamp;
            }

            _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
            uint256 _amount = _claim(
                addr_,
                _token,
                votingEscrow,
                _lastTokenTime
            );
            if (_amount != 0) {
                tokenLastBalance[_token] -= _amount;
                if (_token == address(0)) {
                    require(payable(addr_).send(_amount), "Transfer failed");
                } else {
                    require(
                        IERC20(_token).transfer(addr_, _amount),
                        "Transfer failed"
                    );
                }
            }
            unchecked {
                ++i;
            }
        }

        return true;
    }

    /***
     * @notice Commit transfer of ownership
     * @param addr_ New admin address
     */
    function commitAdmin(address addr_) external onlyAdmin {
        futureAdmin = addr_;
        emit CommitAdmin(addr_);
    }

    /***
     * @notice Apply transfer of ownership
     */
    function applyAdmin() external onlyAdmin {
        require(futureAdmin != address(0), "No admin set");
        admin = futureAdmin;
        emit ApplyAdmin(futureAdmin);
    }

    /***
     * @notice Toggle permission for checkpointing by any account
     */
    function toggleAllowCheckpointToken() external onlyAdmin {
        canCheckpointToken = !canCheckpointToken;
        emit ToggleAllowCheckpointToken(canCheckpointToken);
    }

    /***
     * @notice Kill the contract
     * @dev Killing transfers the entire token balance to the emergency return address
         and blocks the ability to claim or burn. The contract cannot be unkilled.
     */
    function killMe() external onlyAdmin {
        isKilled = true;
        uint256 _length = tokens.length;
        for (uint256 i; i < _length; ) {
            address _token = tokens[i];
            if (_token == address(0)) {
                require(
                    payable(emergencyReturn).send(address(this).balance),
                    "Transfer failed"
                );
            } else {
                require(
                    IERC20(_token).transfer(
                        emergencyReturn,
                        IERC20(_token).balanceOf(address(this))
                    ),
                    "Transfer failed"
                );
            }

            unchecked {
                ++i;
            }
        }
    }

    /***
     * @notice Recover ERC20 tokens from this contract
     * @dev Tokens are sent to the emergency return address.
     * @param coin_ Token address
     * @return bool success
     */
    function recoverBalance(address coin_) external onlyAdmin returns (bool) {
        require(tokenFlags[coin_], "Cannot recover this token");

        if (coin_ == address(0)) {
            require(
                payable(emergencyReturn).send(address(this).balance),
                "Transfer failed"
            );
        } else {
            require(
                IERC20(coin_).transfer(
                    emergencyReturn,
                    IERC20(coin_).balanceOf(address(this))
                ),
                "Transfer failed"
            );
        }
        return true;
    }

    function addRewardToken(address coin_) external onlyAuction returns (bool) {
        require(coin_ != address(0), "ETH is already registered");
        require(!tokenFlags[coin_], "Token is already registered");

        uint256 _t = (block.timestamp / WEEK) * WEEK;
        lastTokenTime[coin_] = _t;
        tokenFlags[coin_] = true;
        tokens.push(coin_);

        emit AddedToken(coin_);

        return true;
    }

    modifier onlyAdmin() {
        require(admin == msg.sender, "Access denied");
        _;
    }

    /// @dev Allow only auctions
    modifier onlyAuction() {
        require(
            IFactory(factory).auctions(msg.sender),
            "You are not the auction."
        );
        _;
    }

    receive() external payable {}
}
