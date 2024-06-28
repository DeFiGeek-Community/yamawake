class Constants {
  static DAY = BigInt(86400);
  static WEEK = BigInt(86400 * 7);
  static MONTH = BigInt(86400 * 30);
  static YEAR = BigInt(86400 * 365);

  static day = 86400;
  static week = 86400 * 7;
  static month = 86400 * 30;
  static year = 86400 * 365;

  static TYPE_WEIGHTS: BigInt[] = [
    BigInt(5) * (BigInt(10) ** BigInt(17)),
    BigInt(2) * (BigInt(10) ** BigInt(18)),
  ];
  static GAUGE_WEIGHTS: BigInt[] = [
    BigInt(2) * (BigInt(10) ** BigInt(18)),
    BigInt(10) ** BigInt(18),
    BigInt(5) * (BigInt(10) ** BigInt(17)),
  ];

  static symbol = "Token";
  static decimal = 18;
  static INITIAL_SUPPLY = BigInt("450000000000000000000000000");

  static ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  static ten_to_the_24 = BigInt("1000000000000000000000000");
  static ten_to_the_21 = BigInt("1000000000000000000000");
  static ten_to_the_20 = BigInt("100000000000000000000");
  static ten_to_the_19 = BigInt("10000000000000000000");
  static ten_to_the_18 = BigInt("1000000000000000000");
  static ten_to_the_17 = BigInt("100000000000000000");
  static ten_to_the_16 = BigInt("10000000000000000");
  static ten_to_the_9 = BigInt("1000000000");
  static a = BigInt("2");
  static b = BigInt("5");
  static zero = BigInt("0");
  static MAX_UINT256 = BigInt(
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
  );

  static GAUGE_TYPES = [
    BigInt("1"),
    BigInt("1"),
    BigInt("2"),
  ];
}

export default Constants;
