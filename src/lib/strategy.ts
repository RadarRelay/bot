import {RadarRelay, Market, LocalAccount, BaseAccount} from '@radarrelay/sdk';
import {promisify} from 'es6-promisify';
import {BigNumber} from 'bignumber.js';
import {getConfig} from '../helpers';
import colors = require('colors/safe');
import request = require('request-promise');
import prompt = require('prompt');

// Get config
const config = getConfig();

/**
 * Abstract which defines some of the
 * basic methods required for a bot strategy
 *
 * @param {RadarRelay} rr      instance of the RadarRelay SDK class
 * @param {any}        prompt  method which returns a promise used for CLI prompting
 * @param {any}        ccxt    instance of the ccxt class for market data retrieval
 * @param {any}        conf    configuration object retrieved from yaml
 */
export abstract class Strategy<T extends BaseAccount> {
  protected _rr: RadarRelay<T>;
  protected _prompt: any;
  protected _ccxt: any;
  protected _conf: any;

  constructor(rr: RadarRelay<T>, prompt: any, ccxt: any, config) {
    this._rr = rr;
    this._prompt = promisify(prompt.get);
    this._ccxt = ccxt;
    this._conf = config;
  }

  /**
   * Check balances and allowances and
   * enable and wrap eth (if applicable)
   * for both tokens in a specific market
   *
   * @param {Market}  market
   */
  protected async checkBalancesAllowances(market: Market<T>): Promise<void> {
    if (market.id.indexOf('WETH') > -1) {
      // WETH logic
      const ethBal = await this._rr.account.getEthBalanceAsync();
      if (ethBal.gte(this._conf.wrapThreshold)) {
        // TODO leave 2% for transactions?
        console.log(colors.magenta('Wrapping eth...'));
        const hash = await this._rr.account.wrapEthAsync(ethBal.minus(ethBal.times(0.02).toFixed(8)), {
          transactionOpts: {
            gasPrice: new BigNumber(config.gasPrice)
          }
        });
        console.log(colors.cyan(`tx: ${hash}`));
      }
    }

    // enable tokens
    const baseTokenAllowance = await this._rr.account.getTokenAllowanceAsync(market.baseTokenAddress);
    const quoteTokenAllowance = await this._rr.account.getTokenAllowanceAsync(market.quoteTokenAddress);
    if (baseTokenAllowance.lte(0)) {
      console.log(colors.magenta(`Enabling ${market.id.split('-')[0]}...`));
      const hash = await this._rr.account.setUnlimitedTokenAllowanceAsync(market.baseTokenAddress, {
        transactionOpts: {
          gasPrice: new BigNumber(config.gasPrice)
        }
      });
      console.log(colors.cyan(`tx: ${hash}`));
    }
    if (quoteTokenAllowance.lte(0)) {
      console.log(colors.magenta(`Enabling ${market.id.split('-')[1]}...`));
      const hash = await this._rr.account.setUnlimitedTokenAllowanceAsync(market.quoteTokenAddress, {
        transactionOpts: {
          gasPrice: new BigNumber(config.gasPrice)
        }
      });
      console.log(colors.cyan(`tx: ${hash}`));
    }

    console.log('Done!');
  }

  /**
   * Prompt the user for input
   * regarding run options
   *
   * @return {boolean} indicates whether or not to proceed
   */
  protected abstract async optionsPrompt(): Promise<boolean>;

  /**
   * Run method to start the
   * bot strategies logic
   */
  public abstract async run(): Promise<void>;

}


