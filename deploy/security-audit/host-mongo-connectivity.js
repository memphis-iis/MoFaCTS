/* global db, quit */
// Read-only mongosh acquisition, shared by the inert V2 host collector only.
// Authentication is carried in exec environment input, never printed or argv.
(() => {
  let result = { state: 'unavailable', reason: 'query-failed' };
  let code = 70;
  try {
    const raw = process.env.MOFACTS_AUDIT_MONGO_CONNECTIVITY;
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384) throw Error();
    const input = JSON.parse(raw);
    if (!input || Object.keys(input).sort().join(',') !== 'authenticationDatabase,database,operation,password,replicaSet,username'
      || Object.values(input).some(value => typeof value !== 'string' || value.length > 4096)
      || !['unauthenticated', 'replica', 'authenticated'].includes(input.operation)) throw Error();
    const identifier = value => value.length > 0 && value.length <= 128
      && Buffer.byteLength(value, 'utf8') <= 255 && Array.from(value).every(character => {
        const code = character.codePointAt(0);
        return code >= 32 && (code < 127 || code > 159);
      });
    if (!identifier(input.database) || Buffer.byteLength(input.database, 'utf8') > 63
      || /[/\\. "$]/.test(input.database) || !identifier(input.replicaSet)) throw Error();
    if (input.operation !== 'unauthenticated') {
      if (!input.username || !input.password || !input.authenticationDatabase
        || !db.getSiblingDB(input.authenticationDatabase).auth(input.username, input.password).ok) throw Error();
    } else if (input.username || input.password || input.authenticationDatabase) throw Error();
    let value;
    if (input.operation === 'replica') {
      const hello = db.hello();
      if (!hello || hello.ok !== 1) throw Error();
      value = hello.setName === input.replicaSet;
    } else {
      try {
        const reply = db.getSiblingDB(input.database).runCommand({ find: 'tdfs', filter: {}, limit: 1 });
        if (reply?.ok === 1) value = true;
        else if (input.operation === 'unauthenticated' && reply?.code === 13) value = false;
        else throw Error();
      } catch (error) {
        if (input.operation === 'unauthenticated' && error.code === 13) value = false;
        else throw error;
      }
    }
    result = { state: 'observed', value };
    code = 0;
  } catch { /* No database response, credential or exception text is emitted. */ }
  print(JSON.stringify(result));
  quit(code);
})();
