import { Meteor } from 'meteor/meteor';
import * as crypto from 'crypto';
import { createHash } from 'crypto';

const algo = 'aes-256-cbc';

export function encryptData(data: string) {
  const key = crypto.scryptSync(Meteor.settings.encryptionKey, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algo, key, iv);
  let crypted = cipher.update(data, 'utf8', 'hex');
  crypted += cipher.final('hex');
  return iv.toString('hex') + ':' + crypted;
}

export function decryptData(data: string) {
  if (!data) return '';

  if (data.includes(':')) {
    const parts = data.split(':');
    const ivHex = parts[0];
    const encryptedData = parts[1];
    if (!ivHex || !encryptedData) {
      return '';
    }
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(Meteor.settings.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv(algo, key, iv);
    let dec = decipher.update(encryptedData, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } else {
    const key = evpBytesToKey(Meteor.settings.encryptionKey);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key.key, key.iv);
    decipher.setAutoPadding(true);
    let dec = decipher.update(data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  }
}

function evpBytesToKey(password: string, keyLen = 32, ivLen = 16) {
  const md5Hashes: Buffer[] = [];
  let digest = Buffer.from('');
  let totalLen = 0;

  while (totalLen < keyLen + ivLen) {
    const toHash = Buffer.concat([digest, Buffer.from(password, 'binary')]);
    digest = createHash('md5').update(toHash).digest();
    md5Hashes.push(digest);
    totalLen += digest.length;
  }

  const result = Buffer.concat(md5Hashes);
  return {
    key: result.slice(0, keyLen),
    iv: result.slice(keyLen, keyLen + ivLen)
  };
}
