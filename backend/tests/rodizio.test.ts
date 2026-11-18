import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../domain/errors.js';

import { makeService, queueNames, seedBarbers, workingNames } from './helpers.js';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
}

describe('Regras do rodízio (testes obrigatórios 1–4)', () => {
  it('TESTE 1 — entrada na fila respeita a ordem de chegada', () => {
    const { svc } = makeService();
    const [joao, carlos, pedro, marcos] = seedBarbers(svc, 4);
    for (const id of [joao, carlos, pedro, marcos]) svc.enter(id, { actor: 'tablet' });
    assert.deepEqual(queueNames(svc), ['João', 'Carlos', 'Pedro', 'Marcos']);
  });

  it('Rafael entrando depois ocupa a 5ª posição', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 5);
    for (const id of ids) svc.enter(id, { actor: 'tablet' });
    assert.deepEqual(queueNames(svc), ['João', 'Carlos', 'Pedro', 'Marcos', 'Rafael']);
  });

  it('TESTE 2 — arrastar o 1º para TRABALHANDO (rodízio) e Carlos assume a 1ª posição', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 4);
    for (const id of ids) svc.enter(id, { actor: 'tablet' });
    const res = svc.start(ids[0], { actor: 'tablet' });
    assert.equal(res.result?.kind, 'ROTATION');
    assert.deepEqual(queueNames(svc), ['Carlos', 'Pedro', 'Marcos']);
    assert.deepEqual(workingNames(svc), ['João']);
  });

  it('TESTE 3 — finalizar devolve ao FINAL da fila, registra término e duração', () => {
    const { svc, clock } = makeService();
    const ids = seedBarbers(svc, 4);
    for (const id of ids) svc.enter(id, { actor: 'tablet' });
    svc.start(ids[0], { actor: 'tablet' });
    clock.t += 25 * 60_000 + 30_000;
    const res = svc.finish(ids[0], { actor: 'tablet' });
    assert.equal(res.result?.durationSeconds, 25 * 60 + 30);
    assert.deepEqual(queueNames(svc), ['Carlos', 'Pedro', 'Marcos', 'João']);
    assert.deepEqual(workingNames(svc), []);
    const history = svc.history({ limit: 10, offset: 0 });
    assert.equal(history.rows[0].status, 'FINISHED');
    assert.equal(history.rows[0].durationSeconds, 1530);
    assert.equal(history.rows[0].endedAt, clock.t);
  });

  it('TESTE 4 — escolha específica: Pedro (3º) sai sem alterar a ordem relativa dos demais', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 4);
    for (const id of ids) svc.enter(id, { actor: 'tablet' });
    svc.start(ids[0], { actor: 'tablet' }); // João
    svc.finish(ids[0], { actor: 'tablet' }); // fila: Carlos, Pedro, Marcos, João
    // Pedro está na 2ª posição agora; torne-o 3º reorganizando: Carlos, Pedro, Marcos, João -> precisamos Pedro 3º
    svc.start(ids[1], { actor: 'tablet' }); // Carlos (rodízio)
    svc.finish(ids[1], { actor: 'tablet' }); // Pedro, Marcos, João, Carlos
    svc.start(ids[2], { actor: 'tablet' }); // Pedro (rodízio)
    svc.finish(ids[2], { actor: 'tablet' }); // Marcos, João, Carlos, Pedro
    assert.deepEqual(queueNames(svc), ['Marcos', 'João', 'Carlos', 'Pedro']);
    const res = svc.start(ids[2], { actor: 'tablet' }); // Pedro na 4ª => específica
    assert.equal(res.result?.kind, 'SPECIFIC');
    assert.equal(res.result?.position, 4);
    assert.deepEqual(queueNames(svc), ['Marcos', 'João', 'Carlos']);
    assert.deepEqual(workingNames(svc), ['Pedro']);
    svc.finish(ids[2], { actor: 'tablet' });
    assert.deepEqual(queueNames(svc), ['Marcos', 'João', 'Carlos', 'Pedro']);
  });

  it('exemplo do enunciado: Pedro na 3ª posição da fila inicial', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 4);
    for (const id of ids) svc.enter(id, { actor: 'tablet' });
    const res = svc.start(ids[2], { actor: 'tablet' });
    assert.equal(res.result?.kind, 'SPECIFIC');
    assert.equal(res.result?.position, 3);
    assert.deepEqual(queueNames(svc), ['João', 'Carlos', 'Marcos']);
    svc.finish(ids[2], { actor: 'tablet' });
    assert.deepEqual(queueNames(svc), ['João', 'Carlos', 'Marcos', 'Pedro']);
  });

  it('o profissional nunca volta à posição anterior ao finalizar', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 3);
    for (const id of ids) svc.enter(id, { actor: 'tablet' });
    svc.start(ids[0], { actor: 'tablet' });
    svc.finish(ids[0], { actor: 'tablet' });
    assert.equal(queueNames(svc)[0], 'Carlos');
    assert.equal(queueNames(svc).at(-1), 'João');
  });

  it('startNext direciona ao primeiro da fila e falha sem ninguém disponível', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 2);
    assert.equal(code(() => svc.startNext({ actor: 'recepcao' })), 'NO_BARBERS_AVAILABLE');
    svc.enter(ids[0], { actor: 'tablet' });
    svc.enter(ids[1], { actor: 'tablet' });
    const res = svc.startNext({ actor: 'recepcao' });
    assert.equal(res.result?.barberName, 'João');
    assert.equal(res.result?.kind, 'ROTATION');
  });
});

describe('Estados e exceções', () => {
  it('impede duplicidade, atendimento duplo e transições incompatíveis', () => {
    const { svc } = makeService();
    const [a, b] = seedBarbers(svc, 2);
    svc.enter(a, { actor: 't' });
    assert.equal(code(() => svc.enter(a, { actor: 't' })), 'ALREADY_IN_QUEUE');
    svc.start(a, { actor: 't' });
    assert.equal(code(() => svc.start(a, { actor: 't' })), 'ALREADY_WORKING');
    assert.equal(code(() => svc.enter(a, { actor: 't' })), 'ALREADY_WORKING');
    assert.equal(code(() => svc.pause(a, { actor: 't' })), 'FINISH_BEFORE_PAUSE');
    assert.equal(code(() => svc.finish(b, { actor: 't' })), 'NOT_WORKING');
    assert.equal(code(() => svc.start(b, { actor: 't' })), 'IS_OFF');
  });

  it('pausa remove da fila e o retorno insere no final', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 3);
    for (const id of ids) svc.enter(id, { actor: 't' });
    svc.pause(ids[0], { actor: 't' });
    assert.deepEqual(queueNames(svc), ['Carlos', 'Pedro']);
    assert.equal(svc.snapshot().barbers.find((b) => b.id === ids[0])!.state, 'PAUSA');
    assert.equal(code(() => svc.start(ids[0], { actor: 't' })), 'IS_PAUSED');
    svc.resume(ids[0], { actor: 't' });
    assert.deepEqual(queueNames(svc), ['Carlos', 'Pedro', 'João']);
    assert.equal(code(() => svc.resume(ids[1], { actor: 't' })), 'ALREADY_IN_QUEUE');
  });

  it('fora do expediente sai da fila e não pode ser iniciado', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 2);
    svc.enter(ids[0], { actor: 't' });
    svc.clockOut(ids[0], { actor: 't' });
    assert.equal(svc.snapshot().barbers.find((b) => b.id === ids[0])!.state, 'FORA');
    assert.equal(code(() => svc.clockOut(ids[0], { actor: 't' })), 'IS_OFF');
    assert.equal(code(() => svc.start(ids[0], { actor: 't' })), 'IS_OFF');
  });

  it('profissional desativado não entra na fila e histórico é preservado', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 2);
    svc.enter(ids[0], { actor: 't' });
    svc.start(ids[0], { actor: 't' });
    svc.finish(ids[0], { actor: 't' });
    assert.equal(code(() => svc.setBarberActive(ids[0], false, 'recepcao')), 'NO_ERROR');
    assert.equal(code(() => svc.enter(ids[0], { actor: 't' })), 'BARBER_INACTIVE');
    assert.equal(svc.snapshot().barbers.some((b) => b.id === ids[0]), false);
    assert.equal(svc.history({ limit: 10, offset: 0 }).total, 1);
    const admin = svc.adminBarbers().find((b) => b.id === ids[0])!;
    assert.equal(admin.state, 'INATIVO');
    assert.equal(admin.totalAttendances, 1);
  });

  it('não permite desativar quem está em atendimento', () => {
    const { svc } = makeService();
    const [a] = seedBarbers(svc, 1);
    svc.enter(a, { actor: 't' });
    svc.start(a, { actor: 't' });
    assert.equal(code(() => svc.setBarberActive(a, false, 'recepcao')), 'FINISH_BEFORE_PAUSE');
  });

  it('turno encerrado bloqueia operações e limpa fila/atendimentos', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 3);
    for (const id of ids) svc.enter(id, { actor: 't' });
    svc.start(ids[0], { actor: 't' });
    svc.closeShift('recepcao');
    const snap = svc.snapshot();
    assert.equal(snap.shift, null);
    assert.equal(snap.shiftClosedToday, true);
    assert.ok(snap.barbers.every((b) => b.state === 'FORA'));
    assert.equal(code(() => svc.enter(ids[1], { actor: 't' })), 'SHIFT_CLOSED');
    assert.equal(svc.history({ limit: 5, offset: 0 }).rows[0].status, 'CLOSED_BY_SHIFT');
    svc.openShift('recepcao');
    assert.equal(code(() => svc.enter(ids[1], { actor: 't' })), 'NO_ERROR');
  });

  it('turno de dia anterior é encerrado automaticamente e novo turno é aberto', () => {
    const { svc, clock } = makeService();
    const [a] = seedBarbers(svc, 1);
    svc.enter(a, { actor: 't' });
    clock.t += 24 * 3600_000;
    svc.maintain();
    const snap = svc.snapshot();
    assert.ok(snap.shift);
    assert.equal(snap.barbers[0].state, 'FORA');
  });

  it('finalização com attendanceId desatualizado é rejeitada (operações simultâneas)', () => {
    const { svc } = makeService();
    const [a] = seedBarbers(svc, 1);
    svc.enter(a, { actor: 't' });
    const first = svc.start(a, { actor: 't' });
    const staleAttendance = svc.snapshot().barbers[0].attendance!.id;
    svc.finish(a, { actor: 't' }); // outro dispositivo finaliza
    svc.start(a, { actor: 't' }); // novo atendimento
    assert.equal(code(() => svc.finish(a, { actor: 't', attendanceId: staleAttendance })), 'STALE_STATE');
    assert.ok(first.ok);
  });

  it('idempotência: o mesmo opId não executa duas vezes', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 2);
    svc.enter(ids[0], { actor: 't' });
    svc.enter(ids[1], { actor: 't' });
    const one = svc.start(ids[0], { actor: 't', opId: 'op-12345678' });
    const two = svc.start(ids[0], { actor: 't', opId: 'op-12345678' });
    assert.equal(two.result?.duplicate, true);
    assert.equal(two.result?.auditId, one.result?.auditId);
    assert.equal(svc.history({ limit: 10, offset: 0 }).total, 1);
  });

  it('o banco impede fila duplicada e atendimento duplo mesmo fora das regras de serviço', () => {
    const { svc } = makeService();
    const [a] = seedBarbers(svc, 1);
    svc.enter(a, { actor: 't' });
    const shift = svc.shifts.getOpen()!;
    assert.throws(() => svc.queue.pushBack(a, shift.id, 1));
  });
});

describe('Desfazer seguro', () => {
  it('desfaz início de atendimento restaurando a posição original', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 4);
    for (const id of ids) svc.enter(id, { actor: 't' });
    const res = svc.start(ids[2], { actor: 't' });
    assert.deepEqual(queueNames(svc), ['João', 'Carlos', 'Marcos']);
    assert.equal(svc.snapshot().undo?.auditId, res.result!.auditId);
    svc.undo(res.result!.auditId, { actor: 't' });
    assert.deepEqual(queueNames(svc), ['João', 'Carlos', 'Pedro', 'Marcos']);
    assert.deepEqual(workingNames(svc), []);
    assert.equal(svc.history({ limit: 5, offset: 0 }).total, 0);
  });

  it('desfaz finalização reabrindo o atendimento e removendo a nova entrada na fila', () => {
    const { svc, clock } = makeService();
    const ids = seedBarbers(svc, 3);
    for (const id of ids) svc.enter(id, { actor: 't' });
    svc.start(ids[0], { actor: 't' });
    clock.t += 60_000;
    const fin = svc.finish(ids[0], { actor: 't' });
    svc.undo(fin.result!.auditId, { actor: 't' });
    assert.deepEqual(workingNames(svc), ['João']);
    assert.deepEqual(queueNames(svc), ['Carlos', 'Pedro']);
    const att = svc.snapshot().barbers.find((b) => b.id === ids[0])!.attendance!;
    assert.equal(att.startedAt, svc.attendances.get(att.id)!.started_at);
  });

  it('desfaz entrada, pausa e fim de expediente', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 3);
    const e = svc.enter(ids[0], { actor: 't' });
    svc.undo(e.result!.auditId, { actor: 't' });
    assert.deepEqual(queueNames(svc), []);
    svc.enter(ids[0], { actor: 't' });
    svc.enter(ids[1], { actor: 't' });
    const p = svc.pause(ids[0], { actor: 't' });
    svc.undo(p.result!.auditId, { actor: 't' });
    assert.deepEqual(queueNames(svc), ['João', 'Carlos']);
    const c = svc.clockOut(ids[0], { actor: 't' });
    svc.undo(c.result!.auditId, { actor: 't' });
    assert.deepEqual(queueNames(svc), ['João', 'Carlos']);
  });

  it('bloqueia desfazer quando houve alteração posterior', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 3);
    for (const id of ids) svc.enter(id, { actor: 't' });
    const first = svc.start(ids[0], { actor: 't' });
    svc.start(ids[1], { actor: 't' });
    assert.equal(code(() => svc.undo(first.result!.auditId, { actor: 't' })), 'UNDO_BLOCKED');
  });

  it('permite desfazer em sequência (da mais recente para a mais antiga)', () => {
    const { svc } = makeService();
    const ids = seedBarbers(svc, 3);
    for (const id of ids) svc.enter(id, { actor: 't' });
    const a = svc.start(ids[0], { actor: 't' });
    const b = svc.start(ids[1], { actor: 't' });
    svc.undo(b.result!.auditId, { actor: 't' });
    svc.undo(a.result!.auditId, { actor: 't' });
    assert.deepEqual(queueNames(svc), ['João', 'Carlos', 'Pedro']);
  });

  it('não desfaz duas vezes nem após o prazo', () => {
    const { svc, clock } = makeService();
    const ids = seedBarbers(svc, 2);
    svc.enter(ids[0], { actor: 't' });
    const s = svc.start(ids[0], { actor: 't' });
    svc.undo(s.result!.auditId, { actor: 't' });
    assert.equal(code(() => svc.undo(s.result!.auditId, { actor: 't' })), 'UNDO_NOT_FOUND');
    const s2 = svc.start(ids[0], { actor: 't' });
    clock.t += 61_000;
    assert.equal(svc.snapshot().undo, null);
    assert.equal(code(() => svc.undo(s2.result!.auditId, { actor: 't' })), 'UNDO_EXPIRED');
  });
});

