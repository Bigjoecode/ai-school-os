import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  formatMoney,
  inventoryItemSchema,
  stockMovementSchema,
  type AiText,
  type AssetCondition,
  type InventoryCategory,
  type InventoryItemInput,
  type InventoryItemRow,
  type InventoryOverview,
  type StockMovementInput,
  type StockMovementKind,
  type StockMovementRow,
} from '@aischool/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { AuditService } from '../audit/audit.service';
import { RequireFeature, RequirePermissions } from '../common/decorators';
import { dateOnly, parseDate } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsService, addDays } from './operations.service';
import { inventoryBriefingPrompt } from './prompts';

const USE_WEEKS = 8;

/** Expense category a stock purchase is filed under in Finance. */
const EXPENSE_CATEGORY: Partial<Record<InventoryCategory, string>> = {
  MAINTENANCE: 'MAINTENANCE',
  KITCHEN: 'FEEDING',
};

const itemListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(INVENTORY_CATEGORIES).optional(),
  low: z.enum(['true']).optional(),
  assets: z.enum(['true', 'false']).optional(),
});

@Controller('inventory')
@RequireFeature('inventory')
export class InventoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: OperationsService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  private async rows(where: Prisma.InventoryItemWhereInput = {}): Promise<InventoryItemRow[]> {
    const db = this.prisma.db;
    const { today } = await this.ops.school();
    const since = parseDate(addDays(today, -7 * USE_WEEKS));
    const items = await db.inventoryItem.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    const ids = items.map((i) => i.id);
    const [used, last] = await Promise.all([
      db.stockMovement.groupBy({ by: ['itemId'], where: { itemId: { in: ids }, kind: 'OUT', movedOn: { gte: since } }, _sum: { change: true } }),
      db.stockMovement.groupBy({ by: ['itemId'], where: { itemId: { in: ids } }, _max: { movedOn: true } }),
    ]);
    const usedBy = new Map(used.map((u) => [u.itemId, -(u._sum.change ?? 0)]));
    const lastBy = new Map(last.map((l) => [l.itemId, l._max.movedOn]));
    return items.map((i) => {
      const weeklyUse = Math.round(((usedBy.get(i.id) ?? 0) / USE_WEEKS) * 10) / 10;
      return {
        id: i.id,
        name: i.name,
        category: i.category as InventoryCategory,
        unit: i.unit,
        sku: i.sku,
        location: i.location,
        quantity: i.quantity,
        reorderLevel: i.reorderLevel,
        unitCostKobo: i.unitCostKobo,
        valueKobo: i.quantity * i.unitCostKobo,
        isAsset: i.isAsset,
        condition: i.condition as AssetCondition | null,
        low: !i.isAsset && i.reorderLevel > 0 && i.quantity <= i.reorderLevel,
        weeklyUse,
        weeksLeft: weeklyUse > 0 ? Math.round((i.quantity / weeklyUse) * 10) / 10 : null,
        lastMovedOn: dateOnly(lastBy.get(i.id) ?? null),
      };
    });
  }

  @Get('overview')
  @RequirePermissions('inventory.read')
  async overview(): Promise<InventoryOverview> {
    const school = await this.ops.school();
    const items = await this.rows();
    const monthStart = parseDate(`${school.today.slice(0, 7)}-01`);
    const moves = await this.prisma.db.stockMovement.findMany({
      where: { movedOn: { gte: monthStart }, kind: { in: ['IN', 'OUT'] } },
      include: { item: { select: { unitCostKobo: true } } },
    });
    const value = (m: (typeof moves)[number]) => Math.abs(m.change) * (m.unitCostKobo ?? m.item.unitCostKobo);
    const cat = new Map<string, { items: number; valueKobo: number }>();
    for (const i of items) {
      const c = cat.get(i.category) ?? { items: 0, valueKobo: 0 };
      c.items++;
      c.valueKobo += i.valueKobo;
      cat.set(i.category, c);
    }
    return {
      currency: school.currency,
      items: items.length,
      stockValueKobo: items.filter((i) => !i.isAsset).reduce((n, i) => n + i.valueKobo, 0),
      assetValueKobo: items.filter((i) => i.isAsset).reduce((n, i) => n + i.valueKobo, 0),
      lowStock: items.filter((i) => i.low).sort((a, b) => (a.weeksLeft ?? 99) - (b.weeksLeft ?? 99)),
      byCategory: [...cat].map(([category, c]) => ({ category: category as InventoryCategory, ...c })).sort((a, b) => b.valueKobo - a.valueKobo),
      issuedThisMonthKobo: moves.filter((m) => m.kind === 'OUT').reduce((n, m) => n + value(m), 0),
      receivedThisMonthKobo: moves.filter((m) => m.kind === 'IN').reduce((n, m) => n + value(m), 0),
      assetsNeedingAttention: items.filter((i) => i.isAsset && (i.condition === 'POOR' || i.condition === 'BROKEN')).reduce((n, i) => n + i.quantity, 0),
    };
  }

  @Get('items')
  @RequirePermissions('inventory.read')
  async items(@Query(new ZodPipe(itemListQuery)) q: z.infer<typeof itemListQuery>): Promise<InventoryItemRow[]> {
    const terms = q.q?.split(/\s+/).filter(Boolean) ?? [];
    const rows = await this.rows({
      ...(q.category ? { category: q.category } : {}),
      ...(q.assets ? { isAsset: q.assets === 'true' } : {}),
      AND: terms.map((t) => ({ OR: [{ name: { contains: t, mode: 'insensitive' } }, { sku: { contains: t, mode: 'insensitive' } }, { location: { contains: t, mode: 'insensitive' } }] })),
    });
    return q.low ? rows.filter((r) => r.low) : rows;
  }

  @Post('items')
  @RequirePermissions('inventory.manage')
  async create(@Body(new ZodPipe(inventoryItemSchema)) body: InventoryItemInput): Promise<InventoryItemRow> {
    const { openingQuantity, ...data } = body;
    const { today } = await this.ops.school();
    const tenantId = currentTenantId();
    const item = await this.prisma.db.$transaction(async (tx) => {
      const i = await tx.inventoryItem.create({ data: { ...data, tenantId, quantity: openingQuantity ?? 0 } });
      if (openingQuantity) {
        await tx.stockMovement.create({
          data: { tenantId, itemId: i.id, kind: 'IN', change: openingQuantity, balanceAfter: openingQuantity, unitCostKobo: i.unitCostKobo, reason: 'Opening stock', movedOn: parseDate(today), recordedById: currentContext().userId },
        });
      }
      return i;
    });
    await this.audit.log({ action: 'inventory.item_added', entityType: 'InventoryItem', entityId: item.id, summary: `Added ${item.name} to stores (${item.quantity} ${item.unit})` });
    return (await this.rows({ id: item.id }))[0]!;
  }

  @Put('items/:id')
  @RequirePermissions('inventory.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(inventoryItemSchema)) body: InventoryItemInput): Promise<InventoryItemRow> {
    const { openingQuantity: _ignored, ...data } = body;
    await this.prisma.db.inventoryItem.update({ where: { id }, data });
    return (await this.rows({ id }))[0]!;
  }

  @Delete('items/:id')
  @HttpCode(204)
  @RequirePermissions('inventory.manage')
  async remove(@Param('id') id: string) {
    const i = await this.prisma.db.inventoryItem.findUniqueOrThrow({ where: { id } });
    if (i.quantity > 0) throw new BadRequestException(`There are still ${i.quantity} ${i.unit} in stock — issue or count them out first`);
    await this.prisma.db.inventoryItem.delete({ where: { id } });
    await this.audit.log({ action: 'inventory.item_removed', entityType: 'InventoryItem', entityId: id, summary: `Removed ${i.name} from stores` });
  }

  // ---------------------------------------------------------- movements

  private movementRow(m: Prisma.StockMovementGetPayload<{ include: { item: { select: { id: true; name: true; unit: true } } } }>, names: Map<string, string>): StockMovementRow {
    return {
      id: m.id,
      item: m.item,
      kind: m.kind as StockMovementKind,
      change: m.change,
      balanceAfter: m.balanceAfter,
      unitCostKobo: m.unitCostKobo,
      reason: m.reason,
      issuedTo: m.issuedTo,
      supplier: m.supplier,
      movedOn: dateOnly(m.movedOn)!,
      recordedBy: m.recordedById ? (names.get(m.recordedById) ?? null) : null,
      expenseRecorded: !!m.expenseId,
    };
  }

  @Get('movements')
  @RequirePermissions('inventory.read')
  async movements(@Query(new ZodPipe(z.object({ itemId: z.string().optional() }))) q: { itemId?: string }): Promise<StockMovementRow[]> {
    const rows = await this.prisma.db.stockMovement.findMany({
      where: q.itemId ? { itemId: q.itemId } : {},
      include: { item: { select: { id: true, name: true, unit: true } } },
      orderBy: [{ movedOn: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    const names = await this.ops.userNames(rows.map((r) => r.recordedById));
    return rows.map((r) => this.movementRow(r, names));
  }

  @Post('items/:id/movements')
  @RequirePermissions('inventory.manage')
  async move(@Param('id') id: string, @Body(new ZodPipe(stockMovementSchema)) body: StockMovementInput): Promise<StockMovementRow> {
    const db = this.prisma.db;
    const school = await this.ops.school();
    const movedOn = body.movedOn ?? school.today;
    if (movedOn > school.today) throw new BadRequestException("Stock movements can't be dated in the future");
    if (body.kind !== 'ADJUST' && body.quantity <= 0) throw new BadRequestException('Enter a quantity');
    if (body.recordExpense && body.kind !== 'IN') throw new BadRequestException('Only stock received can be recorded as an expense');
    const tenantId = currentTenantId();
    const userId = currentContext().userId;

    const movement = await db.$transaction(async (tx) => {
      // Lock the item row so concurrent issues can't take stock below zero.
      await tx.$executeRaw`SELECT id FROM inventory_items WHERE id = ${id} FOR UPDATE`;
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
      const change = body.kind === 'IN' ? body.quantity : body.kind === 'OUT' ? -body.quantity : body.quantity - item.quantity;
      if (body.kind === 'OUT' && body.quantity > item.quantity) {
        throw new BadRequestException(`Only ${item.quantity} ${item.unit} in stock`);
      }
      if (body.kind === 'ADJUST' && change === 0) throw new BadRequestException(`The count matches the ${item.quantity} ${item.unit} already recorded`);
      const balance = item.quantity + change;
      const unitCost = body.unitCostKobo ?? item.unitCostKobo;
      // Received stock moves the unit cost to the weighted average.
      const newCost =
        body.kind === 'IN' && body.unitCostKobo !== undefined && balance > 0
          ? Math.round((Math.max(0, item.quantity) * item.unitCostKobo + body.quantity * body.unitCostKobo) / balance)
          : item.unitCostKobo;
      await tx.inventoryItem.update({ where: { id }, data: { quantity: balance, unitCostKobo: newCost } });
      let expenseId: string | null = null;
      if (body.recordExpense) {
        const amount = body.quantity * unitCost;
        if (amount <= 0) throw new BadRequestException('Enter the unit cost to record this purchase as an expense');
        const e = await tx.expense.create({
          data: {
            tenantId,
            category: EXPENSE_CATEGORY[item.category as InventoryCategory] ?? 'SUPPLIES',
            description: `${item.name} × ${body.quantity} ${item.unit}`,
            amountKobo: amount,
            spentOn: parseDate(movedOn),
            paidTo: body.supplier,
            reference: 'Stores',
            recordedById: userId,
          },
        });
        expenseId = e.id;
      }
      return tx.stockMovement.create({
        data: {
          tenantId,
          itemId: id,
          kind: body.kind,
          change,
          balanceAfter: balance,
          unitCostKobo: body.kind === 'IN' ? unitCost : item.unitCostKobo,
          reason: body.reason ?? (body.kind === 'ADJUST' ? 'Stock count' : null),
          issuedTo: body.issuedTo,
          supplier: body.supplier,
          movedOn: parseDate(movedOn),
          recordedById: userId,
          expenseId,
        },
        include: { item: { select: { id: true, name: true, unit: true } } },
      });
    });
    const verb = body.kind === 'IN' ? 'Received' : body.kind === 'OUT' ? 'Issued' : 'Counted';
    await this.audit.log({
      action: `inventory.${body.kind.toLowerCase()}`,
      entityType: 'InventoryItem',
      entityId: id,
      summary: `${verb} ${movement.item.name}: ${movement.change > 0 ? '+' : ''}${movement.change} ${movement.item.unit}${body.issuedTo ? ` to ${body.issuedTo}` : ''} (now ${movement.balanceAfter})`,
    });
    return this.movementRow(movement, await this.ops.userNames([userId ?? null]));
  }

  // ---------------------------------------------------------- AI

  @Post('insight')
  @HttpCode(200)
  @RequirePermissions('inventory.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async insight(): Promise<AiText> {
    const o = await this.overview();
    if (!o.items) throw new BadRequestException('Add items to stores first');
    const items = await this.rows();
    const school = await this.ops.school();
    const money = (k: number) => formatMoney(k, o.currency);
    const data = [
      `Currency ${o.currency}. ${o.items} items; stock value ${money(o.stockValueKobo)}; assets ${money(o.assetValueKobo)}.`,
      `This month: received ${money(o.receivedThisMonthKobo)}, issued ${money(o.issuedThisMonthKobo)}.`,
      `Consumables (name | on hand | reorder level | used per week | weeks left | unit price):\n${items
        .filter((i) => !i.isAsset)
        .map((i) => `${i.name} | ${i.quantity} ${i.unit} | ${i.reorderLevel} | ${i.weeklyUse} | ${i.weeksLeft ?? 'not used lately'} | ${money(i.unitCostKobo)}`)
        .join('\n')}`,
      `Assets needing attention: ${items.filter((i) => i.isAsset && (i.condition === 'POOR' || i.condition === 'BROKEN')).map((i) => `${i.name} ×${i.quantity} (${i.condition?.toLowerCase()}, ${INVENTORY_CATEGORY_LABELS[i.category]})`).join('; ') || 'none'}.`,
    ].join('\n');
    const { system, user } = inventoryBriefingPrompt(school.name, data);
    const r = await this.gateway.generate({ tier: 'standard', system, messages: [{ role: 'user', content: user }] }, 'inventory-insight');
    return { text: r.text, provider: r.provider, model: r.model };
  }
}
