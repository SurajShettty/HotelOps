import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HousekeepingService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { room: true, assignedTo: true },
      orderBy: { createdAt: 'desc' },
      distinct: ['roomId'],
    });

    const relevant = latestPerRoom.filter((t) => t.room.status !== 'OCCUPIED');
    const filtered = status ? relevant.filter((t) => t.status === status) : relevant;

    return filtered.sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async updateTask(id: string, data: { status?: 'DIRTY' | 'IN_PROGRESS' | 'INSPECTED' | 'READY'; assignedToId?: string }) {
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

    return task;
  }
}
