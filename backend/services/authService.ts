import crypto from 'node:crypto';
import type { SystemRepository } from '../repositories/systemRepository.js';
import { AppError } from '../domain/errors.js';

const ADMIN_ID = 'recepcao';
const SESSION_HOURS = 12;

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Controle básico de acesso: PIN da recepção (hash scrypt) + token assinado (HMAC). */
export class AuthService {
  private secret: Buffer;
  private attempts = new Map<string, { count: number; blockedUntil: number }>();

  constructor(
    private system: SystemRepository,
    initialPin: string,
  ) {
    let secret = system.getSetting('session_secret');
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      system.setSetting('session_secret', secret);
    }
    this.secret = Buffer.from(secret, 'hex');
    if (!system.findUser(ADMIN_ID)) {
      system.insertUser('Recepção', 'ADMIN', ADMIN_ID, hashPin(initialPin), Date.now());
      // Pede troca do PIN se estiver usando o padrão.
      system.setSetting('must_change_pin', initialPin === '1234' ? '1' : '0');
    }
  }

  get mustChangePin(): boolean {
    return this.system.getSetting('must_change_pin') === '1';
  }

  login(pin: string, ip: string): { token: string; expiresAt: number; mustChangePin: boolean } {
    const now = Date.now();
    const rec = this.attempts.get(ip);
    if (rec && rec.blockedUntil > now) throw new AppError('TOO_MANY_ATTEMPTS');
    const user = this.system.findUser(ADMIN_ID);
    if (!user || !verifyPin(String(pin ?? ''), user.pin_hash)) {
      const count = (rec?.count ?? 0) + 1;
      this.attempts.set(ip, { count, blockedUntil: count >= 5 ? now + 30_000 : 0 });
      if (count >= 5) this.attempts.set(ip, { count: 0, blockedUntil: now + 30_000 });
      throw new AppError('BAD_PIN');
    }
    this.attempts.delete(ip);
    const expiresAt = now + SESSION_HOURS * 3600_000;
    return { token: this.sign({ sub: ADMIN_ID, exp: expiresAt }), expiresAt, mustChangePin: this.mustChangePin };
  }

  changePin(currentPin: string, newPin: string): void {
    const user = this.system.findUser(ADMIN_ID);
    if (!user || !verifyPin(String(currentPin ?? ''), user.pin_hash)) throw new AppError('BAD_PIN');
    if (!/^\d{4,12}$/.test(String(newPin ?? ''))) {
      throw new AppError('BAD_REQUEST', 'O NOVO PIN DEVE TER DE 4 A 12 DÍGITOS.');
    }
    this.system.updatePin(ADMIN_ID, hashPin(newPin));
    this.system.setSetting('must_change_pin', '0');
  }

  /** Valida o cabeçalho Authorization e devolve o identificador do usuário. */
  verifyToken(token: string | undefined): string {
    if (!token) throw new AppError('UNAUTHORIZED');
    const [body, sig] = token.split('.');
    if (!body || !sig) throw new AppError('UNAUTHORIZED');
    const expected = crypto.createHmac('sha256', this.secret).update(body).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      throw new AppError('UNAUTHORIZED');
    }
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { sub: string; exp: number };
      if (payload.exp < Date.now()) throw new AppError('UNAUTHORIZED');
      return payload.sub;
    } catch {
      throw new AppError('UNAUTHORIZED');
    }
  }

  private sign(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }
}

