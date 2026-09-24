import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { isPermission, roleSchema, type RoleInput, type RoleRow } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

function checkPermissions(perms: string[]): string[] {
  const unknown = perms.filter((p) => !isPermission(p));
  if (unknown.length) {
    throw new BadRequestException({
      statusCode: 400,
      message: `Unknown permissions: ${unknown.join(', ')}`,
      errors: [{ path: 'permissions', message: 'Unknown permission' }],
    });
  }
  return [...new Set(perms)];
}

function keyFrom(name: string) {
  return `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`.slice(0, 60);
}

@Controller('roles')
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('users.read')
  async list(): Promise<RoleRow[]> {
    const roles = await this.prisma.db.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { members: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions,
      memberCount: r._count.members,
    }));
  }

  @Post()
  @RequirePermissions('roles.manage')
  async create(@Body(new ZodPipe(roleSchema)) body: RoleInput) {
    const role = await this.prisma.db.role.create({
      data: {
        tenantId: currentTenantId(),
        key: keyFrom(body.name),
        name: body.name,
        description: body.description,
        permissions: checkPermissions(body.permissions),
      },
    });
    await this.audit.log({
      action: 'roles.created',
      entityType: 'Role',
      entityId: role.id,
      summary: `Created role ${role.name} with ${role.permissions.length} permissions`,
    });
    return role;
  }

  @Patch(':id')
  @RequirePermissions('roles.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(roleSchema)) body: RoleInput) {
    const existing = await this.prisma.db.role.findUniqueOrThrow({ where: { id } });
    if (existing.key === 'school_admin') {
      throw new BadRequestException('The School Admin role always has every permission');
    }
    const role = await this.prisma.db.role.update({
      where: { id },
      data: { name: body.name, description: body.description, permissions: checkPermissions(body.permissions) },
    });
    const added = role.permissions.filter((p) => !existing.permissions.includes(p));
    const removed = existing.permissions.filter((p) => !role.permissions.includes(p));
    await this.audit.log({
      action: 'roles.updated',
      entityType: 'Role',
      entityId: id,
      summary: `Updated role ${role.name}` +
        (added.length ? `; added ${added.join(', ')}` : '') +
        (removed.length ? `; removed ${removed.join(', ')}` : ''),
      metadata: { added, removed },
    });
    return role;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('roles.manage')
  async remove(@Param('id') id: string) {
    const role = await this.prisma.db.role.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (role.isSystem) throw new BadRequestException('Built-in roles cannot be deleted');
    if (role._count.members > 0) {
      throw new BadRequestException(`Move the ${role._count.members} people with this role to another role first`);
    }
    await this.prisma.db.role.delete({ where: { id } });
    await this.audit.log({ action: 'roles.deleted', entityType: 'Role', entityId: id, summary: `Deleted role ${role.name}` });
  }
}
