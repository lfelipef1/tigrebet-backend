// Banco de dados em memória para teste (sem MongoDB)
const users = [];
const bets = [];
const gamePeriods = [];

class MemoryDB {
  static users = users;
  static bets = bets;
  static gamePeriods = gamePeriods;

  static async findOne(collection, query) {
    if (collection === 'users') {
      return this.users.find(u => 
        Object.keys(query).every(key => u[key] === query[key])
      ) || null;
    }
    if (collection === 'bets') {
      return this.bets.find(b => 
        Object.keys(query).every(key => b[key] === query[key])
      ) || null;
    }
    return null;
  }

  static async find(collection, query = {}) {
    if (collection === 'users') {
      return this.users.filter(u => 
        Object.keys(query).every(key => u[key] === query[key])
      );
    }
    if (collection === 'bets') {
      return this.bets.filter(b => 
        Object.keys(query).every(key => b[key] === query[key])
      );
    }
    return [];
  }

  static async create(collection, data) {
    const doc = { _id: Date.now().toString(), ...data };
    if (collection === 'users') {
      this.users.push(doc);
    } else if (collection === 'bets') {
      this.bets.push(doc);
    }
    return doc;
  }

  static async findOneAndUpdate(collection, query, update, options = {}) {
    const index = this.users.findIndex(u => 
      Object.keys(query).every(key => u[key] === query[key])
    );
    
    if (index === -1) return null;
    
    if (update.$inc) {
      Object.keys(update.$inc).forEach(key => {
        this.users[index][key] = (this.users[index][key] || 0) + update.$inc[key];
      });
    }
    
    if (update.$set) {
      Object.keys(update.$set).forEach(key => {
        this.users[index][key] = update.$set[key];
      });
    }
    
    return this.users[index];
  }

  static async save() {
    // Simulação de save - não faz nada em memória
    return true;
  }
}

module.exports = MemoryDB;
