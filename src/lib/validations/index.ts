/**
 * Centralized Zod validation schemas for all API route request bodies.
 *
 * Usage in a route handler:
 *   import { checkpointCreate } from '@/lib/validations';
 *   const body = checkpointCreate.parse(await request.json());
 */

export * from './checkpoint';
export * from './mission';
export * from './inspection';
export * from './deficiency';
export * from './corrective-action';
export * from './geofence';
export * from './nofly-zone';
export * from './crossing';
export * from './permit';
export * from './project';
export * from './activity';
export * from './report';
export * from './review';
export * from './telemetry';
export * from './analyze';
