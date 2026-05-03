const crypto = require('crypto');

class SecureRNG {
  constructor() {
    this.seed = crypto.randomBytes(32);
  }

  randomInt(min, max) {
    const range = max - min + 1;
    const bytes = crypto.randomBytes(4);
    const randomValue = bytes.readUInt32BE(0) / 0xFFFFFFFF;
    return Math.floor(randomValue * range) + min;
  }

  randomFloat(min, max) {
    const bytes = crypto.randomBytes(4);
    const randomValue = bytes.readUInt32BE(0) / 0xFFFFFFFF;
    return min + randomValue * (max - min);
  }

  shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  pickWeighted(items, weights) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = this.randomFloat(0, totalWeight);
    
    for (let i = 0; i < items.length; i++) {
      if (random < weights[i]) {
        return items[i];
      }
      random -= weights[i];
    }
    
    return items[items.length - 1];
  }
}

module.exports = new SecureRNG();
