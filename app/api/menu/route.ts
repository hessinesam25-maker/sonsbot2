import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export async function GET() {
  const menu = await db.getMenu();
  return NextResponse.json(menu);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const newItem = await db.addMenuItem(body);

  await db.addAuditLog({
    event_type: 'MENU_ITEM_ADDED',
    actor_type: 'user',
    details: { name: newItem?.name, category: newItem?.category, price: newItem?.price },
  });

  return NextResponse.json(newItem, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, ...updates } = await req.json();
  const updated = await db.updateMenuItem(id, updates);

  await db.addAuditLog({
    event_type: 'MENU_ITEM_UPDATED',
    actor_type: 'user',
    details: { id, name: updated?.name },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing menu item id' }, { status: 400 });
  }

  await db.deleteMenuItem(id);

  await db.addAuditLog({
    event_type: 'MENU_ITEM_DELETED',
    actor_type: 'user',
    details: { id },
  });

  return NextResponse.json({ success: true });
}
