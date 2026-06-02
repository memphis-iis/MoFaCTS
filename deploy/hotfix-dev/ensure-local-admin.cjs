const crypto = require('crypto');

const email = process.env.MOFACTS_AGENT_ADMIN_EMAIL;
const password = process.env.MOFACTS_AGENT_ADMIN_PASSWORD;
const url = process.env.MOFACTS_AGENT_DDP_URL || 'ws://localhost:3200/websocket';

if (!email || !password) {
  console.error('MOFACTS_AGENT_ADMIN_EMAIL and MOFACTS_AGENT_ADMIN_PASSWORD are required.');
  process.exit(1);
}

let nextId = 1;
const pending = new Map();
let connected = false;
let closed = false;
let watchdog = null;

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

function callMethod(ws, method, params) {
  const id = String(nextId++);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send(ws, { msg: 'method', id, method, params });
  });
}

function close(ws, code) {
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
  if (!closed) {
    closed = true;
    ws.close();
  }
  process.exitCode = code;
  setImmediate(() => process.exit(code));
}

function timeout(ms, label) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
}

async function bootstrap(ws) {
  let created = false;
  const digest = crypto.createHash('sha256').update(password).digest('hex');

  try {
    await Promise.race([
      callMethod(ws, 'login', [{ user: { email }, password: { digest, algorithm: 'sha-256' } }]),
      timeout(30000, 'login'),
    ]);
  } catch (loginError) {
    let signupError = null;
    try {
      await Promise.race([
        callMethod(ws, 'signUpUser', [email, password]),
        timeout(30000, 'signUpUser'),
      ]);
      created = true;
    } catch (error) {
      signupError = error;
      const details = error && error.details ? error.details : {};
      const code = details.error || '';
      const message = error && error.message ? error.message : String(error);
      if (code !== 'duplicate-user' && !message.includes('duplicate-user')) {
        throw error;
      }
    }

    try {
      await Promise.race([
        callMethod(ws, 'login', [{ user: { email }, password: { digest, algorithm: 'sha-256' } }]),
        timeout(30000, 'login'),
      ]);
    } catch (secondLoginError) {
      if (signupError) {
        throw new Error(
          `Local admin account ${email} already exists, but the password in deploy/local-dev/agent-secrets.env does not match it. ` +
          'Sign in with the existing password or reset the local database/admin account deliberately.'
        );
      }
      throw secondLoginError || loginError;
    }
  }

  /*
   * Fresh signup can leave us unauthenticated on some Accounts paths, while
   * the second login above guarantees the role check runs as the admin user.
   */
  if (created) {
    await Promise.race([
      callMethod(ws, 'login', [{ user: { email }, password: { digest, algorithm: 'sha-256' } }]),
      timeout(30000, 'post-signup login'),
    ]).catch(() => {});
  }

  const roleFlags = await Promise.race([
    callMethod(ws, 'getCurrentUserRoleFlags', []),
    timeout(30000, 'getCurrentUserRoleFlags'),
  ]);

  if (!roleFlags || roleFlags.admin !== true) {
    throw new Error(`Local admin account exists but admin role was not assigned: ${JSON.stringify(roleFlags)}`);
  }

  console.log(JSON.stringify({ email, created, admin: true }));
}

const ws = new WebSocket(url);

ws.onopen = () => {
  send(ws, { msg: 'connect', version: '1', support: ['1'] });
};

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  if (data.msg === 'ping') {
    send(ws, { msg: 'pong', id: data.id });
    return;
  }

  if (data.msg === 'connected') {
    connected = true;
    try {
      await bootstrap(ws);
      close(ws, 0);
    } catch (error) {
      console.error(error && error.stack ? error.stack : error);
      close(ws, 1);
    }
    return;
  }

  if (data.msg === 'result' && pending.has(data.id)) {
    const entry = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) {
      const error = new Error(data.error.reason || data.error.message || data.error.error || 'DDP method failed');
      error.details = data.error;
      entry.reject(error);
    } else {
      entry.resolve(data.result);
    }
  }
};

ws.onerror = (error) => {
  console.error(error);
  close(ws, 1);
};

watchdog = setTimeout(() => {
  if (!connected) {
    console.error(`Could not connect to ${url}`);
  } else {
    console.error('Local admin bootstrap did not complete.');
  }
  close(ws, 1);
}, 90000);
