// 시험용 대역: 게임 서버의 Space가 물려받는 'cloudflare:workers'의 DurableObject. 노드에는 그 모듈이 없다.
export class DurableObject<E = unknown> {
  ctx: unknown;
  env: E;
  constructor(ctx: unknown, env: E) {
    this.ctx = ctx;
    this.env = env;
  }
}
