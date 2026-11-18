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

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Armazenamento persistente remoto (Supabase) — necessário em ambiente Serverless (Vercel). */
export interface RemoteSettings {
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;
}

/**
 * Controle de acesso: PIN da recepção (hash scrypt) + token assinado (HMAC).
 * Com Supabase, o hash do PIN fica no banco e o segredo da sessão é derivado de uma chave
 * estável, de modo que o login vale para QUALQUER instância Serverless.
 */
export class AuthService {
  private secret: Buffer;
  private attempts = new Map<string, { count: number; blockedUntil: number }>();

  constructor(
    private system: SystemRepository,
    private initialPin: string,
    private remote?: RemoteSettings,
    secretSeed?: string,
  ) {
    let secret = process.env.SESSION_SECRET;
    if (!secret && remote && secretSeed) {
      secret = crypto.createHash('sha256').update(`barba-de-urso:session:${secretSeed}`).digest('hex');
    }
    if (!secret) {
      secret = system.getSetting('session_secret');
      if (!secret) {
        secret = crypto.randomBytes(32).toString('hex');
        system.setSetting('session_secret', secret);
      }
    }
    this.secret = crypto.createHash('sha256').update(secret).digest();
    if (!remote && !system.findUser(ADMIN_ID)) {
      system.insertUser('Recepção', 'ADMIN', ADMIN_ID, hashPin(initialPin), Date.now());
      // Pede troca do PIN se estiver usando o padrão.
      system.setSetting('must_change_pin', initialPin === '1234' ? '1' : '0');
    }
  }

  get mustChangePin(): boolean {
    return this.system.getSetting('must_change_pin') === '1';
  }

  async isMustChangePin(): Promise<boolean> {
    if (!this.remote) return this.mustChangePin;
    const flag = await this.remote.getSetting('must_change_pin');
    if (flag !== undefined) return flag === '1';
    return this.initialPin === '1234';
  }

  private async checkPin(pin: string): Promise<boolean> {
    const given = String(pin ?? '');
    if (!this.remote) {
      const user = this.system.findUser(ADMIN_ID);
      return !!user && verifyPin(given, user.pin_hash);
    }
    const stored = await this.remote.getSetting('admin_pin_hash');
    if (stored) return verifyPin(given, stored);
    return safeEqual(given, this.initialPin);
  }

  async login(pin: string, ip: string): Promise<{ token: string; expiresAt: number; mustChangePin: boolean }> {
    const now = Date.now();
    const rec = this.attempts.get(ip);
    if (rec && rec.blockedUntil > now) throw new AppError('TOO_MANY_ATTEMPTS');
    if (!(await this.checkPin(pin))) {
      const count = (rec?.count ?? 0) + 1;
      this.attempts.set(ip, { count, blockedUntil: count >= 5 ? now + 30_000 : 0 });
      if (count >= 5) this.attempts.set(ip, { count: 0, blockedUntil: now + 30_000 });
      throw new AppError('BAD_PIN');
    }
    this.attempts.delete(ip);
    const expiresAt = now + SESSION_HOURS * 3600_000;
    return {
      token: this.sign({ sub: ADMIN_ID, exp: expiresAt }),
      expiresAt,
      mustChangePin: await this.isMustChangePin(),
    };
  }

  async changePin(currentPin: string, newPin: string): Promise<void> {
    if (!(await this.checkPin(currentPin))) throw new AppError('BAD_PIN');
    if (!/^\d{4,12}$/.test(String(newPin ?? ''))) {
      throw new AppError('BAD_REQUEST', 'O NOVO PIN DEVE TER DE 4 A 12 DÍGITOS.');
    }
    if (this.remote) {
      await this.remote.setSetting('admin_pin_hash', hashPin(newPin));
      await this.remote.setSetting('must_change_pin', '0');
      return;
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
