const fs = require('node:fs');
const path = require('node:path');
const { validateState } = require('./src/engine.js');
class LedgerStore {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'ledger.json'); this.queue = Promise.resolve(); }
  load() {
    if (!fs.existsSync(this.file)) return null;
    const state = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, ''));
    validateState(state);
    return state;
  }
  save(input, expectedRevision) {
    const run = () => {
      validateState(input);
      const current = this.load();
      const revision = current?.revision || 0;
      if (revision !== expectedRevision) throw new Error('账本已在另一窗口更新，请重新打开软件后再保存');
      const state = { ...input, revision: revision + 1, updatedAt: new Date().toISOString() };
      fs.mkdirSync(this.directory, { recursive: true });
      if (current) {
        const backupDirectory = path.join(this.directory, 'backups');
        fs.mkdirSync(backupDirectory, { recursive: true });
        const name = `ledger-${String(revision).padStart(10,'0')}-${Date.now()}.json`;
        fs.copyFileSync(this.file, path.join(backupDirectory, name));
        const backups = fs.readdirSync(backupDirectory).filter(f => /^ledger-\d+-\d+\.json$/.test(f)).sort().reverse();
        for (const file of backups.slice(30)) fs.unlinkSync(path.join(backupDirectory, file));
      }
      const temporary = `${this.file}.${process.pid}.tmp`;
      const handle = fs.openSync(temporary, 'w');
      try { fs.writeFileSync(handle, JSON.stringify(state, null, 2), 'utf8'); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
      fs.renameSync(temporary, this.file);
      return state;
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }
}
module.exports = { LedgerStore };
