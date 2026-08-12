// Types for funnel-contract.js. The union lives here so the TypeScript beacon and the
// JavaScript Worker share one declaration point for the step names.

export type FunnelStep = 'landing' | 'editor' | 'intake' | 'signin' | 'publish' | 'paywall' | 'checkout';

export declare const FUNNEL_STEPS: readonly FunnelStep[];
export declare const DIRECT_REF: 'direct';
export declare const FUNNEL_REF_LIMIT: number;
export declare const OVERFLOW_REF: 'other';

export declare function isFunnelStep(value: unknown): value is FunnelStep;
export declare function sanitizeFunnelRef(value: unknown): string;
export declare function funnelRefFromParams(params: { get(name: string): string | null }): string;
