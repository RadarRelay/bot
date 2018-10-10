import {RadarRelay, LocalAccount, BaseAccount} from '@radarrelay/sdk';
import colors = require('colors/safe');

export class Balances<T extends BaseAccount> {

  private _rr: RadarRelay<T>;

  constructor(radar: RadarRelay<T>) {
    this._rr = radar;
  }

  /**
   * Fetch all token balances
   * for existing wallet default address
   *
   * @param {RadarRelay} rr
   */
  public static async getAllTokenBalances(rr: RadarRelay<BaseAccount>) {
    const balances = {};
    const total = rr.tokens.size;

    // get ETH balance
    const ethBal = await rr.account.getEthBalanceAsync();
    balances['ETH'] = {amount: ethBal.toNumber()};

    // get all token balances
    return new Promise(async (resolve, reject) => {
      let current = 0;
      rr.tokens.forEach(token => {
        rr.account.getTokenBalanceAsync(token.address).then(bal => {
          if (bal.gt(0)) {
            balances[token.symbol] = {
              address: token.address,
              amount: bal.toNumber()
            }
          }
          current += 1;
          if (current >= total) {
            resolve(balances);
          }
        });
      });
    });
  }

  public async run() {
    console.log('\n---------------- BALANCES ----------------');
    console.log(this._rr.account.address);
    console.log('------------------------------------------');
    const balances = await Balances.getAllTokenBalances(this._rr);
    Object.keys(balances).forEach((key) => {
      console.log(`${key}: ${colors.green(balances[key].amount)}`);
    });
  }

}
