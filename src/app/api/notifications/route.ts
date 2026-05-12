import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';


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

// GET /api/notifications - List notifications
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    // Optional filter for unread only
    if (unreadOnly) {
      query = query.eq('read', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    const notifications = (data || []).map(transformNotificationToClient);

    // Also return count of unread
    const unreadCount = notifications.filter(n => !n.read).length;

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
