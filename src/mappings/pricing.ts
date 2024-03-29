/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { BigDecimal, Address } from '@graphprotocol/graph-ts/index'
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD } from './helpers'

const WMATIC_ADDRESS = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'
const USDC_WMATIC_PAIR = '0x1b96b92314c44b159149f7e0303511fb2fc4774f' // created block 589414
const DAI_WMATIC_PAIR = '0xf3010261b58b2874639ca2e860e9005e3be5de0b'  // created block 481116
const USDT_WMATIC_PAIR = '0x20bcc3b8a0091ddac2d0bc30f68e6cbb97de59cd' // created block 648115

export function getMaticPriceInUSD(): BigDecimal {
  // fetch matic prices for each stablecoin
  let usdtPair = Pair.load(USDT_WMATIC_PAIR) // usdt is token0
  let usdcPair = Pair.load(USDC_WMATIC_PAIR) // usdc is token1
  let daiPair = Pair.load(DAI_WMATIC_PAIR)   // dai is token0

  // all 3 have been created
  if (daiPair !== null && usdcPair !== null && usdtPair !== null) {
    let totalLiquidityMATIC = daiPair.reserve1.plus(usdcPair.reserve0).plus(usdtPair.reserve1)
    let daiWeight = daiPair.reserve1.div(totalLiquidityMATIC)
    let usdcWeight = usdcPair.reserve0.div(totalLiquidityMATIC)
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityMATIC)
    return daiPair.token0Price
      .times(daiWeight)
      .plus(usdcPair.token1Price.times(usdcWeight))
      .plus(usdtPair.token0Price.times(usdtWeight))
    // usdc and usdt have been created
  } else if (usdcPair !== null && usdtPair !== null) {
    let totalLiquidityMATIC = usdcPair.reserve0.plus(usdtPair.reserve1)
    let usdcWeight = usdcPair.reserve0.div(totalLiquidityMATIC)
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityMATIC)
    return usdcPair.token1Price.times(usdcWeight).plus(usdtPair.token0Price.times(usdtWeight))
    // usdt is the only pair so far
  } else if (usdcPair !== null) {
    return usdcPair.token1Price
  } else if (usdtPair !== null) {
    return usdtPair.token0Price
  } else {
    return ZERO_BD
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WMATIC
  '0xe9e7cea3dedca5984780bafc599bd69add087d56', // USDC
  '0x55d398326f99059ff775485246999027b3197955', // USDT
]

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_MATIC = BigDecimal.fromString('2')

/**
 * Search through graph to find derived Matic per token.
 * @todo update to be derived MATIC (add stablecoin estimates)
 **/
export function findMaticPerToken(token: Token): BigDecimal {
  if (token.id == WMATIC_ADDRESS) {
    return ONE_BD
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]))
    if (pairAddress.toHexString() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHexString())
      if (pair.token0 == token.id && pair.reserveMATIC.gt(MINIMUM_LIQUIDITY_THRESHOLD_MATIC)) {
        let token1 = Token.load(pair.token1)
        return pair.token1Price.times(token1.derivedMATIC as BigDecimal) // return token1 per our token * Matic per token 1
      }
      if (pair.token1 == token.id && pair.reserveMATIC.gt(MINIMUM_LIQUIDITY_THRESHOLD_MATIC)) {
        let token0 = Token.load(pair.token0)
        return pair.token0Price.times(token0.derivedMATIC as BigDecimal) // return token0 per our token * MATIC per token 0
      }
    }
  }
  return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedMATIC.times(bundle.maticPrice)
  let price1 = token1.derivedMATIC.times(bundle.maticPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedMATIC.times(bundle.maticPrice)
  let price1 = token1.derivedMATIC.times(bundle.maticPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
