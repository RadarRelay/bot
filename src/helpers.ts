import colors = require('colors/safe');
import fs = require('fs');
import yaml = require('js-yaml');
import request = require('request-promise');

let config;

/**
 * Retrieves config and cached data
 */
export function getConfig() {
  // TODO better in memory cache
  if (config) return config;

  // load config yml
  let file;
  try {
    file = fs.readFileSync('config.yml', 'utf8');
  } catch (err) {
    console.error(colors.red('[config] config.yml not found, copy example.config.yml and adjust config params accordingly.'));
    process.exit(0);
  }
  config = yaml.safeLoad(file);

  // get markets cache
  let cache;
  try {
    cache = fs.readFileSync('./.cache', 'utf8');
    cache = JSON.parse(cache);
  } catch(err) {
    console.log(colors.yellow('[config] no cached data found...'));
  }

  // set markets cache to config
  config.markets = cache ? cache.markets : undefined;
  if (config.gasPrice) {
    config.gasPrice = config.gasPrice * 1000000000; // gwei to wei
  }
  // return config
  return config;
}

/**
 * Convert eth/weth market
 * to Radar Market ID format
 *
 * @param {string} market
 */
export function marketToRadarFormat(market: string) {
  const radarMarket = (market.indexOf('WETH') > 0 || market.indexOf('weth') > 0)
    ? market : market.replace(/\/ETH$/i, '/WETH');
  return radarMarket.toUpperCase().replace('/', '-');
}

/**
 * Convert eth/weth market
 * to CCXT format
 *
 * @param {string} market
 */
export function marketToCCXTFormat(market: string) {
 const ccxtMarket = (market.indexOf('WETH') > 0 || market.indexOf('weth') > 0)
   ? market.replace(/WETH$/i, 'ETH') : market;
 return ccxtMarket.toUpperCase();
}

/**
 * Check if a wallet exists
 */
export function walletExists(): boolean {
  try {
    return fs.existsSync('.s-wallet');
  } catch (err) {
    return false;
  }
}

/**
 * Get current gas price
 * from ethgastation API
 *
 * @param {number} configGasPrice
 */
export async function checkGasPrice(configGasPrice: number) {
  let response;
  try {
    response = await
      request.get({
        url: 'https://ethgasstation.info/json/ethgasAPI.json',
        json: true
      });
  } catch (err) {
    console.error(err);
  }
  if (response && response.safeLow) {
    const safeLow = response.safeLow / 10;
    if (configGasPrice <  safeLow * 1000000000) {
      console.log(colors.yellow(`[WARNING] current config.gasPrice is below ethgasstation.info SafeLow of ${safeLow}`));
    }
  }
}

/**
 * Convert array keys
 * to object numbers
 *
 * @param {any}   input
 * @param {array} keys
 */
export function convertKeysToNumber(input: any, keys: Array<string>) {
  for (const key of keys) {
    input[key] = Number(input[key]);
  }
  return input;
}

/**
 * Simple async delay
 *
 * @param {number} milliseconds
 */
export async function delay(milliseconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

