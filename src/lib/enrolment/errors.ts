/**
 * An org-scoped lookup found nothing (technical-plan §10, EVAL-080): another organisation's ID reads
 * exactly like an unknown one. The Next side answers 404.
 */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}
