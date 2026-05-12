import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

// Transform snake_case database row to camelCase
function transformNotificationToClient(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    title: row.title,
    message: row.message,
    timestamp: row.timestamp,
    read: row.read,
    link: row.link,
    createdAt: row.created_at,
  };
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/notifications/[id]/read - Mark notification as read
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { data: notification, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Notification not found' },
          { status: 404 }
        );
      }
      console.error('Error marking notification as read:', error);
      return NextResponse.json(
        { error: 'Failed to update notification' },
        { status: 500 }
      );
    }

    return NextResponse.json(transformNotificationToClient(notification));
  } catch (error) {
    console.error('Unexpected error in POST /api/notifications/[id]/read:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
