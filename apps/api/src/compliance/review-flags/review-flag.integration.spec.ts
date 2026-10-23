import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ReviewFlagModule } from './review-flag.module';
import { ReviewFlagService } from './review-flag.service';

describe('Compliance review flags (HTTP integration)', () => {
  let app: INestApplication;
  let service: ReviewFlagService;
  const AUTH = { Authorization: 'Bearer test-compliance-secret' };
  const original = process.env.COMPLIANCE_ADMIN_SECRET;

  const body = (over: Record<string, unknown> = {}) => ({
    subjectType: 'transaction',
    subjectId: 'tx-100',
    reason: 'high_value',
    severity: 'high',
    createdBy: 'risk-engine',
    ...over,
  });

  beforeAll(async () => {
    process.env.COMPLIANCE_ADMIN_SECRET = 'test-compliance-secret';
    const moduleRef = await Test.createTestingModule({ imports: [ReviewFlagModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirrors the global pipe configured in main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    service = moduleRef.get(ReviewFlagService);
  });

  afterAll(async () => {
    await app.close();
    if (original === undefined) delete process.env.COMPLIANCE_ADMIN_SECRET;
    else process.env.COMPLIANCE_ADMIN_SECRET = original;
  });

  beforeEach(() => service.reset());

  it('rejects unauthenticated and wrongly-authenticated requests', async () => {
    await request(app.getHttpServer()).get('/compliance/review-flags').expect(401);
    await request(app.getHttpServer())
      .post('/compliance/review-flags')
      .set('Authorization', 'Bearer nope')
      .send(body())
      .expect(401);
    expect(service.size()).toBe(0);
  });

  it('creates a flag (201) and returns the active duplicate (200)', async () => {
    const created = await request(app.getHttpServer()).post('/compliance/review-flags').set(AUTH).send(body()).expect(201);
    expect(created.body).toMatchObject({ status: 'open', severity: 'high' });

    const dup = await request(app.getHttpServer()).post('/compliance/review-flags').set(AUTH).send(body()).expect(200);
    expect(dup.body.id).toBe(created.body.id);
  });

  it('drives a flag through the review workflow over HTTP', async () => {
    const { body: flag } = await request(app.getHttpServer()).post('/compliance/review-flags').set(AUTH).send(body());
    const url = `/compliance/review-flags/${flag.id}/status`;

    await request(app.getHttpServer()).patch(url).set(AUTH).send({ status: 'under_review', actor: 'analyst-1' }).expect(200);
    await request(app.getHttpServer()).patch(url).set(AUTH).send({ status: 'cleared', actor: 'analyst-1' }).expect(400);
    const cleared = await request(app.getHttpServer())
      .patch(url)
      .set(AUTH)
      .send({ status: 'cleared', actor: 'analyst-1', note: 'verified customer' })
      .expect(200);
    expect(cleared.body.history.map((h: any) => h.to)).toEqual(['open', 'under_review', 'cleared']);

    await request(app.getHttpServer()).patch(url).set(AUTH).send({ status: 'under_review', actor: 'analyst-1' }).expect(409);
    expect(service.requiresReview('transaction', 'tx-100')).toBe(false);
  });

  it('returns 404 for an unknown flag', async () => {
    await request(app.getHttpServer()).get('/compliance/review-flags/missing').set(AUTH).expect(404);
    await request(app.getHttpServer())
      .patch('/compliance/review-flags/missing/status')
      .set(AUTH)
      .send({ status: 'under_review', actor: 'a1' })
      .expect(404);
  });

  it.each([
    { severity: 'extreme' },
    { subjectId: 'bad id' },
    { reason: undefined },
    { unexpected: 'field' },
  ])('rejects invalid create payload %p with 400', async (over) => {
    await request(app.getHttpServer()).post('/compliance/review-flags').set(AUTH).send(body(over)).expect(400);
  });

  it('lists paginated, filtered flags', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/compliance/review-flags').set(AUTH).send(body({ subjectId: `tx-${i}` }));
    }
    await request(app.getHttpServer())
      .post('/compliance/review-flags')
      .set(AUTH)
      .send(body({ subjectType: 'account', subjectId: 'acct-1', severity: 'low' }));

    const page = await request(app.getHttpServer()).get('/compliance/review-flags?limit=4&page=2').set(AUTH).expect(200);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.pagination).toMatchObject({ total: 6, totalPages: 2, hasPreviousPage: true });

    const filtered = await request(app.getHttpServer()).get('/compliance/review-flags?subjectType=account').set(AUTH).expect(200);
    expect(filtered.body.pagination.total).toBe(1);
  });

  it.each(['limit=0', 'limit=101', 'page=0', 'status=bogus', 'subjectId=bad%20id', 'extra=1'])(
    'rejects invalid list query %p with 400',
    async (qs) => {
      await request(app.getHttpServer()).get(`/compliance/review-flags?${qs}`).set(AUTH).expect(400);
    },
  );
});
