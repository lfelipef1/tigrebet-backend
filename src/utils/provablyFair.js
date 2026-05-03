const crypto = require('crypto');

/**
 * Provably Fair Logic
 * Generates a result and a verification hash.
 */
class ProvablyFair {
  static generateResult(serverSeed, clientSeed, nonce) {
    const hash = crypto
      .createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest('hex');
    
    // Use the first 8 characters of the hash to generate a number
    const resultInt = parseInt(hash.substring(0, 8), 16);
    return {
      hash,
      resultInt,
    };
  }

  static generateServerSeed() {
    return crypto.randomBytes(32).toString('hex');
  }
}

module.exports = ProvablyFair;