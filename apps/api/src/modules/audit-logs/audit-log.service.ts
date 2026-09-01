import { Injectable } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';

/** Either the plain client or a `$transaction` callback's `tx` — record() works with both. */
export type AuditClient = PrismaService | Prisma.TransactionClient;

export interface AuditEntry {
  hotelId: string | null;
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return Number(value);
  }
  return value;
}

/**
 * Field-level before/after for an UPDATE — only keys whose value actually
 * changed are included, and the result is exactly what `AuditLogsService`
 * needs to revert the change (`diff.before` is a ready-to-apply patch).
 * `before`/`after` are separate generics (not one shared `T`) because most
 * call sites fetch them from separate queries with different `include`
 * shapes (e.g. the post-update row often includes a relation the pre-update
 * row doesn't) — only `keys` needs to be common to both.
 */
export function fieldDiff<A extends Record<string, unknown>, B extends Record<string, unknown>>(
  before: A,
  after: B,
  keys: readonly (keyof A & keyof B)[],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const beforeOut: Record<string, unknown> = {};
  const afterOut: Record<string, unknown> = {};
  for (const key of keys) {
    const b = normalize(before[key]);
    const a = normalize(after[key]);
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      beforeOut[key as string] = b;
      afterOut[key as string] = a;
    }
  }
  return { before: beforeOut, after: afterOut };
}

/** Picks + normalizes a set of fields off a row — for a CREATE/DELETE full snapshot. */
export function snapshot<T extends Record<string, unknown>>(row: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key as string] = normalize(row[key]);
  return out;
}

@Injectable()
export class AuditLogService {
  async record(client: AuditClient, entry: AuditEntry): Promise<void> {
    await client.auditLog.create({
      data: {
        hotelId: entry.hotelId,
        actorId: entry.actorId,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        diff: { before: entry.before ?? null, after: entry.after ?? null } as Prisma.InputJsonValue,
      },
    });
  }
}
