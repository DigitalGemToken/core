const reject = require('lodash/reject')
const Promise = require('bluebird')

const container = require('@arkecosystem/core-container')
const logger = container.resolvePlugin('logger')
const { Transaction } = require('@arkecosystem/crypto').models
const dynamicFeeMatch = require('./utils/dynamicfee-matcher')

module.exports = class TransactionGuard {
  /**
   * Create a new transaction guard instance.
   * @param  {TransactionPoolInterface} pool
   * @return {void}
   */
  constructor (pool) {
    this.pool = pool

    this.__reset()
  }

  /**
   * Validate the specified transactions. Order of called functions is important
   * @param  {Array} transactions
   * @param  {Boolean} isBroadcast flag
   * @return {void}
   */
  async validate (transactions, isBroadCasted) {
    this.__reset()

    await this.__transformAndFilterTransations(transactions)

    this.__determineInvalidTransactions()

    this.__determineFeeMatchingTransactions()

    await this.__determineExcessTransactions()
  }

  /**
   * Get a list of transaction ids.
   * @param  {String} type
   * @return {Object}
   */
  getIds (type = null) {
    if (type) {
      return this[type].map(transaction => transaction.id)
    }

    return {
      transactions: this.transactions.map(transaction => transaction.id),
      accept: this.accept.map(transaction => transaction.id),
      excess: this.excess.map(transaction => transaction.id),
      invalid: this.invalid.map(transaction => transaction.id)
    }
  }

  /**
   * Get a list of transaction objects.
   * @param  {String} type
   * @return {Object}
   */
  getTransactions (type = null) {
    if (type) {
      return this[type]
    }

    return {
      transactions: this.transactions,
      accept: this.accept,
      excess: this.excess,
      invalid: this.invalid
    }
  }

  /**
   * Check if there are N transactions of the specified type.
   * @param  {String}  type
   * @param  {Number}  count
   * @return {Boolean}
   */
  has (type, count) {
    return this.hasAny(type) === count
  }

  /**
   * Check if there are at least N transactions of the specified type.
   * @param  {String}  type
   * @param  {Number}  count
   * @return {Boolean}
   */
  hasAtLeast (type, count) {
    return this.hasAny(type) >= count
  }

  /**
   * Check if there are any transactions of the specified type.
   * @param  {String}  type
   * @return {Boolean}
   */
  hasAny (type) {
    return this[type].length
  }

  /**
   * Transforms and filters incomming transactions.
   * It skips duplicates and not valid crypto transactions
   * @param  {Array} transactions
   * @return {void}
   */
  async __transformAndFilterTransations (transactions) {
    this.transactions = []
    await Promise.each(transactions, async (transaction) => {
      const exists = await this.pool.transactionExists(transaction.id)
      if (!exists) {
        const trx = new Transaction(transaction)
        if (trx.verified) this.transactions.push(new Transaction(transaction))
      }
    })
  }

  /**
   * Determine any transactions that do not match the accepted fee by delegate or max fee set by sender
   * Matched transactions stay in this.transaction, mis-matched transaction are pushed in this.invalid
   * @return {void}
   */
  __determineFeeMatchingTransactions () {
    const dynamicFeeResults = dynamicFeeMatch(this.transactions)
    this.transactions = dynamicFeeResults.feesMatching
    this.invalid.concat(dynamicFeeResults.invalidFees)
  }

  /**
   * Determine any invalid transactions, usually caused by insufficient funds.
   * @return {void}
   */
  __determineInvalidTransactions () {
    this.transactions = reject(this.transactions, transaction => {
      const wallet = this.pool.walletManager.getWalletByPublicKey(transaction.senderPublicKey)

      if (!wallet.canApply(transaction)) {
        logger.debug(`Guard: Can't apply transaction ${transaction.id} with ${transaction.amount} to wallet with ${wallet.balance} balance`)
        this.invalid.push(transaction)
        return true
      }

      console.log(this.pool.walletManager.getWalletByPublicKey(transaction.senderPublicKey).balance)
      this.pool.walletManager.applyTransaction(transaction)
      console.log(this.pool.walletManager.getWalletByPublicKey(transaction.senderPublicKey).balance)
      console.log(this.pool.walletManager.getWalletByAddress(transaction.recipientId).balance)

      console.log(container
        .resolvePlugin('blockchain')
        .database
        .walletManager
        .getWalletByPublicKey(transaction.senderPublicKey).balance)

      return false
    })
  }

  /**
   * Determine transactions that exceed the rate-limit.
   * @return {void}
   */
  async __determineExcessTransactions () {
    const transactions = await this.pool.determineExcessTransactions(this.transactions)

    this.accept = transactions.accept
    this.excess = transactions.excess
  }

  /**
   * Reset all indices.
   * @return {void}
   */
  __reset () {
    this.transactions = []
    this.accept = []
    this.excess = []
    this.invalid = []
  }
}
