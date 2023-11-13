// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interfaces/IGaugeController.sol";
import "./interfaces/IYMWK.sol";
import "./interfaces/IMinter.sol";
import "./interfaces/IVotingEscrow.sol";

contract LiquidityGaugeV6 is ReentrancyGuard {
    event UpdateLiquidityLimit(
        address user,
        uint256 originalBalance,
        uint256 originalSupply,
        uint256 workingBalance,
        uint256 workingSupply
    );
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
    uint256 public constant TOKENLESS_PRODUCTION = 40;
    uint256 public constant WEEK = 604800;
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

    // user -> [uint128 claimable amount][uint128 claimed amount]
    mapping(address => mapping(address => uint256)) public claimData;

    mapping(address => uint256) public workingBalances;
    uint256 public workingSupply;

    // 1e18 * ∫(rate(t) / totalSupply(t) dt) from (last_action) till checkpoint
    mapping(address => uint256) public integrateInvSupplyOf;
    mapping(address => uint256) public integrateCheckpointOf;

    // ∫(balance * rate(t) / totalSupply(t) dt) from 0 till checkpoint
    mapping(address => uint256) public integrateFraction;

    // The goal is to be able to calculate ∫(rate * balance / totalSupply dt) from 0 till checkpoint
    int128 public period;

    // Using dynamic array instead of fixed 100000000000000000000000000000 array to avoid warning about collisions
    uint256[100000000000000000000000000000] public periodTimestamp;
    uint256[100000000000000000000000000000] public integrateInvSupply;

    constructor(address minter_) {
        minter = minter_;
        token = IMinter(minter).token();
        gaugeController = IMinter(minter).controller();
        votingEscrow = IGaugeController(gaugeController).votingEscrow();

        periodTimestamp[0] = block.timestamp;
        admin = msg.sender;

        // Assuming you have the YMWK20 interface defined somewhere for the following line
        inflationRate = IYMWK(token).rate();
        futureEpochTime = IYMWK(token).futureEpochTimeWrite();
    }

    function _checkpoint(address addr) internal {
        CheckPointParameters memory _st;

        _st.period = period;
        _st.periodTime = periodTimestamp[uint256(uint128(_st.period))];
        _st.integrateInvSupply = integrateInvSupply[
            uint256(uint128(_st.period))
        ];

        _st.rate = inflationRate;
        _st.prevFutureEpoch = futureEpochTime;
        _st.newRate = _st.rate;

        if (_st.prevFutureEpoch >= _st.periodTime) {
            futureEpochTime = IYMWK(token).futureEpochTimeWrite();
            _st.newRate = IYMWK(token).rate();
            inflationRate = _st.newRate;
        }

        if (isKilled) {
            _st.rate = 0;
            _st.newRate = 0;
        }

        if (block.timestamp > _st.periodTime) {
            uint256 _workingSupply = workingSupply;
            IGaugeController(gaugeController).checkpointGauge(address(this));
            uint256 _prevWeekTime = _st.periodTime;
            uint256 _weekTime = min(
                ((_st.periodTime + WEEK) / WEEK) * WEEK,
                block.timestamp
            );

            for (uint256 i = 0; i < 500; ) {
                uint256 dt = _weekTime - _prevWeekTime;
                uint256 w = IGaugeController(gaugeController)
                    .gaugeRelativeWeight(
                        address(this),
                        (_prevWeekTime / WEEK) * WEEK
                    );

                if (_workingSupply > 0) {
                    if (
                        _st.prevFutureEpoch >= _prevWeekTime &&
                        _st.prevFutureEpoch < _weekTime
                    ) {
                        _st.integrateInvSupply +=
                            (_st.rate *
                                w *
                                (_st.prevFutureEpoch - _prevWeekTime)) /
                            _workingSupply;
                        _st.rate = _st.newRate;
                        _st.integrateInvSupply +=
                            (_st.rate * w * (_weekTime - _st.prevFutureEpoch)) /
                            _workingSupply;
                    } else {
                        _st.integrateInvSupply +=
                            (_st.rate * w * dt) /
                            _workingSupply;
                    }
                }

                if (_weekTime == block.timestamp) {
                    break;
                }
                _prevWeekTime = _weekTime;
                _weekTime = min(_weekTime + WEEK, block.timestamp);
                unchecked {
                    ++i;
                }
            }
        }

        _st.period += 1;
        period = _st.period;
        periodTimestamp[uint256(uint128(_st.period))] = block.timestamp;
        integrateInvSupply[uint256(uint128(_st.period))] = _st
            .integrateInvSupply;

        uint256 _workingBalance = workingBalances[addr];
        integrateFraction[addr] +=
            (_workingBalance *
                (_st.integrateInvSupply - integrateInvSupplyOf[addr])) /
            10 ** 18;
        integrateInvSupplyOf[addr] = _st.integrateInvSupply;
        integrateCheckpointOf[addr] = block.timestamp;
    }

    function userCheckpoint(address addr_) external returns (bool) {
        require(
            msg.sender == addr_ || msg.sender == minter,
            "dev: unauthorized"
        );
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
