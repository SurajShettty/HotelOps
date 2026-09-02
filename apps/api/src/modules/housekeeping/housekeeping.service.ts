import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hotelops/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService, fieldDiff } from '../audit-logs/audit-log.service';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class HousekeepingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Every DIRTY housekeeping task in the app is created through here (checkout,
   * mid-stay room move, upgrade/downgrade) so the auto-assign roster applies
   * uniformly — a task created by hand doesn't need this, since the caller
   * already knows who they're assigning it to.
   */
  async createDirtyTask(client: DbClient, params: { roomId: string; priority?: number }) {
    const room = await client.room.findUniqueOrThrow({ where: { id: params.roomId }, select: { hotelId: true, floor: true } });
    const assignedToId = await this.resolveAutoAssignee(client, room.hotelId, room.floor);
    return client.housekeepingTask.create({
      data: { roomId: params.roomId, status: 'DIRTY', priority: params.priority ?? 0, assignedToId },
    });
  }

  private async resolveAutoAssignee(client: DbClient, hotelId: string, floor: string | null): Promise<string | undefined> {
    if (!floor) return undefined;
    const hotel = await client.hotel.findUnique({ where: { id: hotelId }, select: { housekeepingAutoAssignEnabled: true } });
    if (!hotel?.housekeepingAutoAssignEnabled) return undefined;
    const assignment = await client.housekeepingFloorAssignment.findUnique({ where: { hotelId_floor: { hotelId, floor } } });
    return assignment?.userId;
  }

  /**
   * Just id+name for staff holding HOUSEKEEPING at this hotel — powers the
   * assignee dropdown on the Housekeeping board. Deliberately narrower than
   * GET /users (full profiles, every role, management-only) so RECEPTIONIST/
   * HOUSEKEEPING can populate that dropdown without needing broader access
   * to the staff directory.
   */
  async listAssignableStaff(hotelId: string) {
    const grants = await this.prisma.userHotelRole.findMany({
      where: { hotelId, role: { name: 'HOUSEKEEPING' }, user: { isActive: true } },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });
    return grants.map((g) => g.user);
  }

  listFloorAssignments(hotelId: string) {
    return this.prisma.housekeepingFloorAssignment.findMany({
      where: { hotelId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { floor: 'asc' },
    });
  }

  upsertFloorAssignment(hotelId: string, floor: string, userId: string) {
    return this.prisma.housekeepingFloorAssignment.upsert({
      where: { hotelId_floor: { hotelId, floor } },
      create: { hotelId, floor, userId },
      update: { userId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async removeFloorAssignment(id: string, hotelId: string) {
    const existing = await this.prisma.housekeepingFloorAssignment.findUnique({ where: { id } });
    if (!existing || existing.hotelId !== hotelId) throw new NotFoundException('Floor assignment not found');
    await this.prisma.housekeepingFloorAssignment.delete({ where: { id } });
  }

  /**
   * The live housekeeping board: one row per room (its most recent task —
   * `distinct` + `orderBy: createdAt desc` picks the newest per roomId),
   * excluding rooms currently occupied. Without the dedup, every checkout
   * creates a brand-new task row and old completed ones (status READY) are
   * never closed out, so they'd pile up in the Ready column across cycles.
   * Full history (including superseded tasks) is still available via
   * GET /reports/housekeeping for reporting.
   */
  async findTasks(hotelId: string, status?: string) {
    const latestPerRoom = await this.prisma.housekeepingTask.findMany({
      where: { room: { hotelId } },
      include: {
        room: true,
        assignedTo: { select: { id: true, fullName: true, email: true } },
        nudgedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['roomId'],
    });

    const relevant = latestPerRoom.filter((t) => t.room.status !== 'OCCUPIED');
    const filtered = status ? relevant.filter((t) => t.status === status) : relevant;

    return filtered.sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async updateTask(id: string, data: { status?: 'DIRTY' | 'IN_PROGRESS' | 'INSPECTED' | 'READY'; assignedToId?: string | null }, actorId: string) {
    const before = await this.prisma.housekeepingTask.findUniqueOrThrow({ where: { id }, include: { room: { select: { hotelId: true } } } });
    const task = await this.prisma.housekeepingTask.update({
      where: { id },
      data: {
        ...data,
        completedAt: data.status === 'READY' ? new Date() : undefined,
      },
    });

    if (data.status === 'READY') {
      await this.prisma.room.update({ where: { id: task.roomId }, data: { status: 'AVAILABLE' } });
    }

    const diff = fieldDiff(before, task, ['status', 'assignedToId'] as const);
    await this.auditLog.record(this.prisma, {
      hotelId: before.room.hotelId,
      actorId,
      entity: 'HousekeepingTask',
      entityId: id,
      action: 'UPDATE',
      before: diff.before,
      after: diff.after,
    });

    return task;
  }

  /**
   * In-app-only "notify the assignee" for the Dashboard's overdue-housekeeping
   * alert — no SMS/email/push integration exists in this codebase, so this
   * just timestamps the task; the Housekeeping board highlights any task with
   * a recent nudgedAt so the assignee sees it next time they open their board.
   */
  async nudge(id: string, actorId: string) {
    const task = await this.prisma.housekeepingTask.findUniqueOrThrow({ where: { id } });
    if (!task.assignedToId) {
      throw new BadRequestException({ code: 'NO_ASSIGNEE', message: 'This task has no assigned staff to notify.' });
    }
    if (task.status === 'READY') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'This task is already done.' });
    }
    return this.prisma.housekeepingTask.update({
      where: { id },
      data: { nudgedAt: new Date(), nudgedById: actorId },
      include: { assignedTo: { select: { id: true, fullName: true } } },
    });
  }
}
