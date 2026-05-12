/**
 * Server-side helper that resolves the airspace context (geofence + active
 * no-fly zones) for a given project ID.
 *
 * Used by:
 *   - /api/geofences GET (mock fallback path)
 *   - /api/nofly-zones GET (mock fallback path)
 *   - /api/generate-mission POST (validation step)
 *   - /api/missions POST (validation step)
 *
 * Tries Supabase first; on error or empty result, falls back to mock data so
 * the demo project keeps working without a database.
 */

import { createServerClient } from '@/lib/supabase/server';
import { project as riversideProject } from '@/data/project';
import { linearProject } from '@/data/linear-project';
import { mockNoFlyZones } from '@/data/mock-no-fly-zones';
import { deriveDefaultGeofence } from '@/lib/geofence';
import type { Geofence } from '@/types/geofence';
import type { NoFlyZone, NoFlyZoneCategory } from '@/types/nofly-zone';
import type { Project } from '@/types/project';

const STATIC_PROJECTS: Project[] = [riversideProject, linearProject];

export function getStaticProject(projectId: string): Project | undefined {
  return STATIC_PROJECTS.find((p) => p.id === projectId);
}

export function transformGeofence(row: Record<string, unknown>): Geofence {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    polygon: row.polygon as [number, number][],
    ceilingFeet:
      row.ceiling_feet != null ? Number(row.ceiling_feet) : undefined,
    floorFeet: row.floor_feet != null ? Number(row.floor_feet) : undefined,
    source: (row.source as 'auto' | 'manual') ?? 'auto',
    notes: (row.notes as string | null) ?? undefined,
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
}

export function geofenceToSnakeCase(g: Partial<Geofence>) {
  return {
    id: g.id,
    project_id: g.projectId,
    name: g.name,
    polygon: g.polygon,
    ceiling_feet: g.ceilingFeet ?? null,
    floor_feet: g.floorFeet ?? null,
    source: g.source ?? 'manual',
    notes: g.notes ?? null,
  };
}

export function transformNoFlyZone(row: Record<string, unknown>): NoFlyZone {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    category: row.category as NoFlyZoneCategory,
    polygon: row.polygon as [number, number][],
    floorFeet: row.floor_feet != null ? Number(row.floor_feet) : undefined,
    ceilingFeet:
      row.ceiling_feet != null ? Number(row.ceiling_feet) : undefined,
    description: (row.description as string | null) ?? undefined,
    source: (row.source as string | null) ?? undefined,
    active: (row.active as boolean) ?? true,
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
}

export function noFlyZoneToSnakeCase(z: Partial<NoFlyZone>) {
  return {
    id: z.id,
    project_id: z.projectId,
    name: z.name,
    category: z.category,
    polygon: z.polygon,
    floor_feet: z.floorFeet ?? null,
    ceiling_feet: z.ceilingFeet ?? null,
    description: z.description ?? null,
    source: z.source ?? null,
    active: z.active ?? true,
  };
}

/**
 * Fetch the effective geofence(s) for a project. Tries Supabase first; if no
 * rows or DB error, returns the auto-derived geofence from the static project
 * mock data. Returns an empty array if the project is unknown and DB has no
 * rows.
 */
export async function fetchGeofencesForProject(
  projectId: string
): Promise<Geofence[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('geofences')
      .select('*')
      .eq('project_id', projectId);
    if (error) throw error;
    if (data && data.length > 0) {
      return data.map(transformGeofence);
    }
  } catch {
    // fall through to mock
  }
  const project = getStaticProject(projectId);
  if (!project) return [];
  // Prefer an explicit geofence baked into the mock project, then fall back
  // to the auto-derived one.
  if (project.geofence) return [project.geofence];
  const derived = deriveDefaultGeofence(project);
  return derived ? [derived] : [];
}

/**
 * Fetch active no-fly zones for a project. Tries Supabase; falls back to
 * mock data filtered by projectId.
 */
export async function fetchNoFlyZonesForProject(
  projectId: string,
  options: { onlyActive?: boolean } = {}
): Promise<NoFlyZone[]> {
  const onlyActive = options.onlyActive ?? true;
  try {
    const supabase = createServerClient();
    let query = supabase.from('nofly_zones').select('*').eq('project_id', projectId);
    if (onlyActive) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) {
      return data.map(transformNoFlyZone);
    }
  } catch {
    // fall through to mock
  }
  const filtered = mockNoFlyZones.filter(
    (z) => z.projectId === projectId && (!onlyActive || z.active)
  );
  return filtered;
}

/**
 * Convenience: fetch both the primary geofence and active no-fly zones for a
 * project in parallel. Returns `geofence: undefined` if none.
 */
export async function fetchAirspaceContext(
  projectId: string
): Promise<{ geofence: Geofence | undefined; noFlyZones: NoFlyZone[] }> {
  const [geofences, noFlyZones] = await Promise.all([
    fetchGeofencesForProject(projectId),
    fetchNoFlyZonesForProject(projectId),
  ]);
  return { geofence: geofences[0], noFlyZones };
}
