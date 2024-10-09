// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title GaugeControllerV1
/// @author DeFiGeek Community Japan
/// @notice Controls liquidity gauges and the issuance of token through the gauges
contract GaugeControllerV1 is UUPSUpgradeable {
    event CommitOwnership(address admin);
    event ApplyOwnership(address admin);

    uint256 constant MULTIPLIER = 10 ** 18;

    // Can and will be a smart contract
    address public admin;
    // Can and will be a smart contract
    address public futureAdmin;
    // YMWK token
    address public token;
    // Voting escrow
    address public votingEscrow;

    int128 public nGaugeTypes;
    int128 public nGauges; //number of gauges
    mapping(int128 => string) public gaugeTypeNames;

    // Needed for enumeration
    address[1000000000] public gauges;

    // we increment values by 1 prior to storing them here so we can rely on a value
    // of zero as meaning the gauge has not been set    mapping(address => int128) gaugeTypes;
    mapping(address => int128) public gaugeTypes_;

    /***
     *@notice Contract constructor
     *@param _token `Token` contract address
     *@param _votingEscrow `VotingEscrow` contract address
     */
    function initialize(
        address token_,
        address votingEscrow_
    ) public initializer {
        require(token_ != address(0));
        require(votingEscrow_ != address(0));

        admin = msg.sender;
        token = token_;
        votingEscrow = votingEscrow_;

        // Add veYMWK GaugeType
        int128 _typeId = nGaugeTypes;
        gaugeTypeNames[_typeId] = "veYMWK";
        nGaugeTypes = 1;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyAdmin {}

    /***
     * @notice Transfer ownership of GaugeController to `addr`
     * @param addr_ Address to have ownership transferred to
     */
    function commitTransferOwnership(address addr_) external onlyAdmin {
        futureAdmin = addr_;
        emit CommitOwnership(addr_);
    }

    /***
     * @notice Apply pending ownership transfer
     */
    function applyTransferOwnership() external onlyAdmin {
        address _admin = futureAdmin;
        require(_admin != address(0), "admin not set");
        admin = _admin;
        emit ApplyOwnership(_admin);
    }

    /***
     *@notice Get gauge type for address
     *@param addr_ Gauge address
     *@return Gauge type id
     */
    function gaugeTypes(address addr_) external view returns (int128) {
        int128 _gaugeType = gaugeTypes_[addr_];
        require(_gaugeType != 0, "dev: gauge is not added");

        return _gaugeType - 1;
    }

    /***
     *@notice Add gauge `addr` of type `gauge_type` with weight `weight`
     *@param addr_ Gauge address
     *@param gaugeType_ Gauge type
     */
    function addGauge(address addr_, int128, uint256) external onlyAdmin {
        // Gauge can be added once for V1
        require(nGauges < 1, "Only veYMWK Gauge can be added for V1");
        unchecked {
            nGauges = 1;
        }
        gauges[0] = addr_;
        gaugeTypes_[addr_] = 1;
    }

    /***
     * @notice Checkpoint to fill data common for all gauges
     */
    function checkpoint() external {
        // Doing nothing for V1
    }

    /***
     *@notice Checkpoint to fill data for both a specific gauge and common for all gauges
     *@param addr_ Gauge address
     */
    function checkpointGauge(address) external {
        // Doing nothing for V1
    }

    /***
     *@notice Get Gauge relative weight (not more than 1.0) normalized to 1e18
     *        (e.g. 1.0 == 1e18). Inflation which will be received by it is
     *        inflation_rate * relative_weight / 1e18
     *@param addr_ Gauge address
     *@param time_ Relative weight at the specified timestamp in the past or present
     *@return Value of relative weight normalized to 1e18
     */
    function gaugeRelativeWeight(
        address,
        uint256
    ) external pure returns (uint256) {
        // Just return 1e18 for V1
        return MULTIPLIER;
    }

    modifier onlyAdmin() {
        require(admin == msg.sender, "admin only");
        _;
    }
}
