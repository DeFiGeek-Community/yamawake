// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IVotingEscrow.sol";
import "../interfaces/IFactory.sol";
import "../UUPSBase.sol";

/// @title UpgradableFeeDistributorTest
/// @author DeFiGeek Community Japan
/// @notice Dummy FeeDistributor for upgrading test
contract UpgradableFeeDistributorTest is UUPSBase, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant WEEK = 7 * 86400;

    address public factory;
    uint256 public timeCursor;
    uint256 public lastCheckpointTotalSupplyTime;
    mapping(address => mapping(address => uint256)) public timeCursorOf; // user -> token -> timestamp
    mapping(address => mapping(address => uint256)) public userEpochOf; // user -> token -> epoch

    mapping(address => uint256) public lastTokenTime; // token -> timestamp
    mapping(address => uint256) public startTime; // token -> timestamp
    mapping(address => mapping(uint256 => uint256)) public tokensPerWeek; // token -> week(timestamp) -> amount

    address public votingEscrow;
    address[] public tokens;
    mapping(address => uint256) public tokenFlags; // token -> (0 -> Not registered, 1 -> Registered)

    mapping(address => uint256) public tokenLastBalance; // token -> balance
    mapping(uint256 => uint256) public veSupply; // VE total supply at week bounds

    uint256 public isKilled; // 0 -> Not killed, 1 -> killed

    // New param
    uint256 public newParam;

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
     * @param newParam_ Some number
     */
    function initializeV2(uint256 newParam_) public reinitializer(2) {
        newParam = newParam_;
    }

    function newMethod() external {
        newParam++;
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
        uint256 _currentWeek = block.timestamp / WEEK;
        uint256 _sinceLastInWeeks = _currentWeek - (_t / WEEK);

        /* 
        If current timestamp crosses a week since the last checkpoint,
        set _t to the beginning of the week following the last checkpoint.

        |-x-|---|-●-|
        0   1   2   3
        x: Last checkpoint 
        ●: New checkpoint

        In this case, we start the calculation from (the beginning of) week 1. 
        No more fee will be allocated to week 0.
        */
        if (_sinceLastInWeeks > 0) {
            _t = ((_t + WEEK) / WEEK) * WEEK;
            _sinceLast = block.timestamp - _t;
            _sinceLastInWeeks = _currentWeek - _t / WEEK;
        }
        /*
        If _sinceLast has exceeded 20 weeks,
        set _t to the beginning of the week that is 19 weeks prior to the current block time.

        |-x-|-0-|-0-|-0-|-0-|-0-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|-1-|0.5●-|-
        0   1   2   3   4   5   6   7   8   9   10  11  12  13  14  15  16  17  18  19  20  21  22  23  24  25    26
        x: Last checkpoint 
        ●: New checkpoint

        In this case, we start the calculation from (the beginning of) week 6. 
        No fee will be allocated to the weeks prior to week 5.
        */
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
         This function is only callable by auctions or the contract owner.
     */
    function checkpointToken(address token_) external onlyAdminOrAuction {
        require(tokenFlags[token_] == 1, "Token not registered");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

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

        uint256 _sinceLastInWeeks;
        if (_t > 0 && _roundedTimestamp > _t) {
            unchecked {
                _sinceLastInWeeks = (_roundedTimestamp - _t) / WEEK;
            }
        }

        /*
        If the time since the last checkpoint exceeds 20 weeks,
        set the checkpoint time to the beginning of the week that is 19 weeks prior to the current block time.
        */
        if (_sinceLastInWeeks >= 20) {
            _t = (_roundedTimestamp - WEEK * 19);
        }

        /*
        If the last checkpoint total supply time is the previous week,
        update the veSupply to ensure it reflects the latest state.
        This prevents a scenario where checkpointTotalSupply and veToken's createLock
        occur in the same block, potentially causing veSupply to not be updated with the latest value.
        */
        uint256 _previousWeek = timeCursor > WEEK ? timeCursor - WEEK : 0;
        if (lastCheckpointTotalSupplyTime == _previousWeek) {
            _updateVeSupply(_ve, _previousWeek);
        }

        for (uint256 i; i < 20; ) {
            if (_t > _roundedTimestamp) {
                break;
            } else {
                _updateVeSupply(_ve, _t);
                _t += WEEK;
            }
            unchecked {
                ++i;
            }
        }

        lastCheckpointTotalSupplyTime = block.timestamp;
        timeCursor = _t;
    }

    /**
     * @notice Internal function to update veSupply for a given timestamp.
     * @param _ve The address of the veToken contract.
     * @param _t The timestamp to update veSupply for.
     */
    function _updateVeSupply(address _ve, uint256 _t) internal {
        uint256 _epoch = _findTimestampEpoch(_ve, _t);
        IVotingEscrow.Point memory _pt = IVotingEscrow(_ve).pointHistory(
            _epoch
        );
        int128 _dt = 0;
        if (_t > _pt.ts) {
            _dt = int128(int256(_t) - int256(_pt.ts));
        }
        veSupply[_t] = uint256(int256(_pt.bias - _pt.slope * _dt));
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
            startTime: startTime[token_],
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

                if (_rp.balanceOf > 0 && veSupply[_weekCursor] > 0) {
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
        require(isKilled == 0, "Contract is killed");
        require(tokenFlags[token_] == 1, "Token not registered");
        address _addr = msg.sender;
        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime[token_];

        unchecked {
            _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        }

        uint256 _amount = _claim(_addr, token_, votingEscrow, _lastTokenTime);
        if (_amount != 0) {
            tokenLastBalance[token_] -= _amount;
            if (token_ == address(0)) {
                (bool success, ) = payable(_addr).call{value: _amount}("");
                require(success, "Transfer failed");
            } else {
                IERC20(token_).safeTransfer(_addr, _amount);
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
        require(isKilled == 0, "Contract is killed");
        require(tokenFlags[token_] == 1, "Token not registered");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime[token_];

        unchecked {
            _lastTokenTime = (_lastTokenTime / WEEK) * WEEK;
        }

        uint256 _amount = _claim(addr_, token_, votingEscrow, _lastTokenTime);
        if (_amount != 0) {
            tokenLastBalance[token_] -= _amount;
            if (token_ == address(0)) {
                (bool success, ) = payable(addr_).call{value: _amount}("");
                require(success, "Transfer failed");
            } else {
                IERC20(token_).safeTransfer(addr_, _amount);
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
        require(isKilled == 0, "Contract is killed");
        require(tokenFlags[token_] == 1, "Token not registered");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _lastTokenTime = lastTokenTime[token_];

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
                    (bool success, ) = payable(_addr).call{value: _amount}("");
                    require(success, "Transfer failed");
                } else {
                    IERC20(token_).safeTransfer(_addr, _amount);
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

    /***
     * @notice Claim multiple tokens in one go
     * @param addr_ Receiver address
     * @param tokens_ Token addresses
     * @return bool success
     */
    function claimMultipleTokens(
        address addr_,
        address[20] memory tokens_
    ) external nonReentrant returns (bool) {
        require(isKilled == 0, "Contract is killed");
        require(addr_ != address(0), "Address should not zero");

        if (block.timestamp >= timeCursor) {
            _checkpointTotalSupply();
        }

        uint256 _l = tokens_.length;
        for (uint256 i; i < _l; ) {
            require(tokenFlags[tokens_[i]] == 1, "Token not registered");

            address _token = tokens_[i];
            uint256 _lastTokenTime = lastTokenTime[_token];

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
                    (bool success, ) = payable(addr_).call{value: _amount}("");
                    require(success, "Transfer failed");
                } else {
                    IERC20(_token).safeTransfer(addr_, _amount);
                }
            }
            unchecked {
                ++i;
            }
        }

        return true;
    }

    /***
     * @notice Kill the contract
     * @dev Killing transfers the entire Ether balance to admin address
         and blocks the ability to claim. The contract cannot be unkilled.
         Tokens other than Ether should be transferred using recoverBalance() 
         to avoid failing killing the contract due to unexpected behavior of third party ERC20 tokens
     */
    function killMe() external onlyAdmin {
        isKilled = 1;
        (bool success, ) = payable(admin).call{value: address(this).balance}(
            ""
        );
        require(success, "Transfer failed");
    }

    /***
     * @notice Recover ERC20 tokens from this contract
     * @dev Tokens are sent to admin address.
     * @param coin_ Token address
     * @return bool success
     */
    function recoverBalance(address coin_) external onlyAdmin returns (bool) {
        require(tokenFlags[coin_] == 1, "Cannot recover this token");

        if (coin_ == address(0)) {
            (bool success, ) = payable(admin).call{
                value: address(this).balance
            }("");
            require(success, "Transfer failed");
        } else {
            IERC20(coin_).safeTransfer(
                admin,
                IERC20(coin_).balanceOf(address(this))
            );
        }
        return true;
    }

    /***
     * @notice Register ERC20 token address to reward tokens
     * @dev This function is suppose to be called during auctions to withdraw sales
     * @param coin_ Token address
     * @return bool success
     */
    function addRewardToken(
        address coin_
    ) external onlyAdminOrAuction returns (bool) {
        require(coin_ != address(0), "ETH is already registered");
        require(tokenFlags[coin_] == 0, "Token is already registered");

        lastTokenTime[coin_] = block.timestamp;
        startTime[coin_] = (block.timestamp / WEEK) * WEEK;
        tokenFlags[coin_] = 1;
        tokens.push(coin_);

        emit AddedToken(coin_);

        return true;
    }

    function getTokens() external view returns (address[] memory) {
        return tokens;
    }

    /// @dev Allow only auctions
    modifier onlyAuction() {
        require(
            IFactory(factory).auctions(msg.sender),
            "You are not the auction."
        );
        _;
    }

    /// @dev Allow only auctions or admin
    modifier onlyAdminOrAuction() {
        require(
            msg.sender == admin || IFactory(factory).auctions(msg.sender),
            "Unauthorized"
        );
        _;
    }

    receive() external payable {}
}
