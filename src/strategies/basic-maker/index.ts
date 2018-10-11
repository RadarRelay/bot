import {RadarRelay, Market, LocalAccount, BaseAccount} from '@radarrelay/sdk';
import {promisify} from 'es6-promisify';
import {convertKeysToNumber, marketToRadarFormat, marketToCCXTFormat, delay} from '../../helpers';
import {Strategy} from '../../lib';
import {BigNumber} from 'bignumber.js';
import colors = require('colors/safe');
import request = require('request-promise');
import prompt = require('prompt');

/**
 * Basic Maker Strategy
 *  The Basic Maker strategy is a simple strategy that
 *  utilizes an array of spread percentages to place
 *  orders on a book at varying spread bands ie. % Δ from GBBO
 *
 * WARNING: This strategy is very rudimentary and should
 * not be used for production ready market making!
 */
export class BasicMakerStrategy<T extends BaseAccount> extends Strategy<T> {

  constructor(rr: RadarRelay<T>, prompt: any, ccxt: any, config) {
    super(rr, prompt, ccxt, config);
  }

  /**
   * Get ticker data for a market
   * from multiple exchanges as well
   * as Radar.
   *
   * @param {string}  market  market in the format of ZRX/ETH
   */
  public async getMarketTickers(market: string) {
    let gbbo;
    let radar;

    try {
      gbbo = await this._ccxt.getMarketTicker(marketToCCXTFormat(market));
    } catch(err) {
      console.log(colors.red(err.message.split('\n')[0]));
    }

    try {
      const rrMarket = await this._rr.markets.getAsync(marketToRadarFormat(market));
      radar = await rrMarket.getTickerAsync();

      // Normalize the bid/ask nomenclature
      radar.bid = radar.bestBid;
      radar.ask = radar.bestAsk;
      delete radar.bestBid;
      delete radar.bestAsk;

      // Explicit string to number conversion to avoid NaN during calculations
      radar = convertKeysToNumber(radar, ['price', 'size', 'timestamp', 'bid', 'ask']);
    } catch(err) {
      console.log(colors.red(err.message.split('\n')[0]));
    }

    return {
      gbbo,
      radar
    }
  }

  /**
   * Seed liquidity on the books
   * using a basic algorithm defined
   * in the config
   *
   * @param {Market}  market
   * @param {quantities} {}
   */
  public async seedLiquidity(market: Market<T>, quantities: { totalBidAmountBase: number,  totalAskAmountBase: number }, ticker) {

    // Create Buy/Sell Orders
    // ---------------------
    const expiration = this._conf.algo.expiration * (60 * 60);
    let sellRate = ticker.ask; // NOTE: this is from a users perspective
    let buyRate = ticker.bid;  // so these are the inverse...
    let x = 0;

    console.log(colors.green("\n" + `Creating ${market.id} orders...`));
    await Promise.all([
      this.populateBuySideAsync(buyRate, new BigNumber(quantities.totalBidAmountBase), expiration, market),
      this.populateSellSideAsync(sellRate, new BigNumber(quantities.totalAskAmountBase), expiration, market)
    ]);
  }

  /**
   * populate the bids side of the book
   *
   * @param {number}    buyRate
   * @param {BigNumber} totalBidAmountBase
   * @param {number}    expiration
   * @param {Market}    market
   */
  private async populateBuySideAsync(buyRate: number, totalBidAmountBase: BigNumber, expiration: number, market: Market<T>) {
    if(buyRate === 0) return;
    const quantity = totalBidAmountBase.dividedBy(this._conf.algo.spread.length);

    if (quantity.greaterThan(0)) {
      for (const spreadPercentage of this._conf.algo.spread) {
        buyRate = buyRate - (buyRate * Number(spreadPercentage));

        console.log('[Limit Order] BUY', quantity.toNumber(), market.id, 'at', buyRate );
        await market.limitOrderAsync(('BUY' as any),
          quantity,
          new BigNumber(String(buyRate)),
          new BigNumber((new Date().getTime() / 1000) + expiration).floor() // expiration in hours
        );

        await delay(2000);
      }
    }
  }

  /**
   * populate the asks side of the book
   *
   * @param {number}    sellRate
   * @param {BigNumber} totalAskAmountBase
   * @param {number}    expiration
   * @param {Market}    market
   */
  private async populateSellSideAsync(sellRate: number, totalAskAmountBase: BigNumber, expiration: number, market: Market<T>) {
    if(sellRate === 0) return;
    const quantity = totalAskAmountBase.dividedBy(this._conf.algo.spread.length);

    if (quantity.greaterThan(0)) {
      for (const spreadPercentage of this._conf.algo.spread) {
        sellRate = sellRate + (sellRate * Number(spreadPercentage));

        console.log('[Limit Order] SELL', quantity.toNumber(), market.id, 'at', sellRate );
        await market.limitOrderAsync(('SELL' as any),
          quantity,
          new BigNumber(String(sellRate)),
          new BigNumber((new Date().getTime() / 1000) +  expiration).floor() // expiration in hours
        );

        await delay(2000);
      }
    }
  }

  /**
   * Prompt functionality for
   * collecting bid/ask prices
   */
  protected async tickerAmountsPrompt(): Promise<{
    bid,
    ask
  }> {
    const prices = await this._prompt([{
      name: 'askPrice',
      type: 'number',
      description: colors.cyan(`Enter buy price`),
      required: true,
      conform: value => {
        return /\d+/.test(value);
      }
    },{
      name: 'bidPrice',
      type: 'number',
      description: colors.cyan(`Enter sell price`),
      required: true,
      conform: value => {
        return /\d+/.test(value);
      }
    }]);

    return {
      bid: prices.askPrice, // NOTE: return ticker
      ask: prices.bidPrice  // from api perspective
    };
  }

  /**
   * Prompt a user for input regarding
   * the current selected market
   *
   * @param {string} market
   * @param {any}    tickerSelection
   * @param {any}    radarMarket
   */
  protected async marketAmountsPrompt(
    market: string, tickerSelection: any, radarMarket: any
  ): Promise<{
    totalBidAmountBase,
    totalAskAmountBase
  }> {
    let quantities;
    let quantitiesAccepted;

    const markets = market.split('/');
    console.log(colors.green(`\nChoose BID/ASK amounts in base.`));

    quantities = await this._prompt([{
      name: 'totalBidAmountBase',
      type: 'number',
      description: colors.cyan(`#${markets[0]} to buy:`),
      required: true,
      conform: value => {
        return /\d+/.test(value);
      }
    },{
      name: 'totalAskAmountBase',
      type: 'number',
      description: colors.cyan(`#${markets[0]} to sell:`),
      required: true,
      conform: value => {
        return /\d+/.test(value);
      }
    }]);

    const { bid, ask } = tickerSelection;

    // TODO break this into a seperate function
    const spreads = this._conf.algo.spread;

    let bidQuoteTotal = 0;
    let askQuoteTotal = 0;
    spreads.forEach(spread => {
      bidQuoteTotal += ((quantities.totalBidAmountBase / spreads.length) * (bid - (bid * Number(spread))));
      askQuoteTotal += ((quantities.totalAskAmountBase / spreads.length) * (ask + (ask * Number(spread))));
    });

    const quoteBal = await this._rr.account.getTokenBalanceAsync(radarMarket.quoteTokenAddress);
    const baseBal = await this._rr.account.getTokenBalanceAsync(radarMarket.baseTokenAddress);

    let bidPercentageOfQuote = (bidQuoteTotal / quoteBal.toNumber()) * 100;
    let askPercentageOfBase = (quantities.totalAskAmountBase / baseBal.toNumber()) * 100;

    if (quantities.totalBidAmountBase && bidPercentageOfQuote > 100) {
      console.log(colors.yellow(`\nBid Amount is greater than balance.`));
      return await this.marketAmountsPrompt(market, tickerSelection, radarMarket);
    }

    if (quantities.totalAskAmountBase && askPercentageOfBase > 100) {
      console.log(colors.yellow(`\nAsk Amount is greater than balance.`));
      return await this.marketAmountsPrompt(market, tickerSelection, radarMarket);
    }

    askPercentageOfBase = isNaN(askPercentageOfBase) ? 0 : askPercentageOfBase;
    bidPercentageOfQuote = isNaN(bidPercentageOfQuote) ? 0 : bidPercentageOfQuote;

    console.log(`\nYou are buying ` + colors.green(`${quantities.totalBidAmountBase} ${markets[0]}`) + ` for ` + colors.green(`${bidQuoteTotal.toFixed(4)} ${markets[1]}.`));
    console.log(`This represents ` + colors.green(`${bidPercentageOfQuote.toFixed(4)}%`) + ` of your total ` + colors.green(`${markets[1]}.`));
    console.log(`\nYou are selling ` + colors.green(`${quantities.totalAskAmountBase} ${markets[0]}`) + ` for ` + colors.green(`${askQuoteTotal.toFixed(4)} ${markets[1]}.`));
    console.log(`This represents ` + colors.green(`${askPercentageOfBase.toFixed(4)}%`) + ` of your total ` + colors.green(`${markets[0]}.`));

    if (tickerSelection.confidence < 100) {
      console.log(colors.yellow(`\n[warning] ticker data was retrieved with ${tickerSelection.confidence}% market confidence...\n`));
    }

    return quantities;
  }

  /**
   * Prompt a user for input regarding
   * the current selected market
   */
  protected async optionsPrompt(): Promise<boolean> {

    // Choose market
    // -------------
    console.log(colors.green('\nWhich market?'));
    const marketPrompt = await this._prompt([{
      name: 'market',
      type: 'string',
      description: colors.cyan('Enter market'),
      default: 'ZRX/ETH',
      required: true,
      conform: value => {
        return /\w+\/\w+/.test(value);
      }
    }]);
    const market = marketPrompt.market;
    console.log('selected:', colors.green(market));
    const radarMarket = await this._rr.markets.getAsync(marketToRadarFormat(market));

    // Check Balances / Allowances
    // ---------------------------
    console.log(colors.green('\nVerifying balances and allowances...'));
    await this.checkBalancesAllowances(radarMarket);

    // Get tickers
    // -----------
    console.log(colors.green('\nRetrieving price information...'));
    const tickers = await this.getMarketTickers(market);
    console.log(colors.green('\nWhich price source?'));
    console.log(tickers);
    const tickerPrompt = await this._prompt([{
      name: 'ticker',
      type: 'string',
      description: colors.magenta('[g] gbbo') + ', ' + colors.cyan('[r] radar') + ', ' + colors.blue('[c] custom') ,
      default: 'g',
      required: true,
      conform: value => {
        return /R|G|C|r|g|c/.test(value);
      }
    }]);

    // Determine ticker base or use custom
    // -----------------------------------
    let tickerSelection;
    if (tickerPrompt.ticker.toLowerCase() === 'c') {
      tickerSelection = await this.tickerAmountsPrompt();
    } else {
      tickerSelection = tickerPrompt.ticker.toLowerCase() === 'r' ? tickers.radar : tickers.gbbo;
    }
    console.log('selected:\n', colors.green(tickerSelection));

    // Choose buy/sell quantities
    // ---------------------------
    const quantities = await this.marketAmountsPrompt(market, tickerSelection, radarMarket);
    const quantitiesAccepted = await this._prompt([{
      name: 'confirm',
      type: 'string',
      description: colors.cyan('Would you like to confirm? Y/N'),
      required: true,
      conform: value => {
        return /Y|N|y|n/.test(value);
      }
    }]);

    // Start at beginning?
    // TODO should this start at quantities selection?
    if(/N|n/.test(quantitiesAccepted.confirm)) {
      return await this.optionsPrompt();
    } else {

      // Seed liquidity
      // ---------------
      await this.seedLiquidity(radarMarket, quantities, tickerSelection);

      // Seed another market?
      // -----------------
      const another = await this._prompt([{
        name: 'confirm',
        type: 'string',
        description: colors.cyan('Choose another market? Y/N'),
        required: true,
        conform: value => {
          return /Y|N|y|n/.test(value);
        }
      }]);

      if(/Y|y/.test(another.confirm)) {
        await this.optionsPrompt();
      }

      return true;
    }
  }

  /**
   * Run this strategy
   */
  public async run(): Promise<void> {
    await this.optionsPrompt();
  }

}
