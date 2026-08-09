// Site-level motion vocabulary (theme.motion): one resolver shared by the editor
// preview and the published runtime so both derive the identical feel. The
// primitives ride the machinery that already exists — reveal and heroParallax
// compile onto the per-section SectionMotion attributes, hover/captions/stagger
// are pure CSS keyed off root classes (SiteMotion.css).
import type { SectionMotionConfig, SiteMotionConfig } from '../lib/content';

export interface ResolvedSiteMotion {
	intensity: 'subtle' | 'full';
	reveal: boolean;
	hover: boolean;
	hoverCaptions: boolean;
	heroParallax: boolean;
	stagger: boolean;
}

/**
 * theme.motion → the active vocabulary, or null when motion is off. Absent
 * config and intensity 'off' both resolve to null: older sites render exactly
 * as they did before the field existed. Unset primitive flags default to the
 * house feel; heroParallax and hoverCaptions are opt-in (templates declare them).
 */
export function resolveSiteMotion(motion: SiteMotionConfig | undefined): ResolvedSiteMotion | null {
	if (!motion) return null;
	const intensity = motion.intensity;
	if (intensity !== 'subtle' && intensity !== 'full') return null;
	return {
		intensity,
		reveal: motion.reveal !== false,
		hover: motion.hover !== false,
		hoverCaptions: motion.hoverCaptions === true,
		heroParallax: motion.heroParallax === true,
		stagger: motion.stagger !== false,
	};
}

/** Root classes for the CSS-only primitives. Empty string when motion is off. */
export function siteMotionRootClass(resolved: ResolvedSiteMotion | null): string {
	if (!resolved) return '';
	return [
		`motion-site-${resolved.intensity}`,
		resolved.hover && 'motion-site-hover',
		resolved.hoverCaptions && 'motion-site-captions',
		resolved.stagger && 'motion-site-stagger',
	]
		.filter(Boolean)
		.join(' ');
}

/**
 * The per-section config the site vocabulary implies for one page part. A
 * hand-authored sectionMotion entry always wins over this (callers `??` it in).
 * The first part is the page's hero: it drifts (parallax-lite) when that
 * primitive is on, otherwise it reveals like everything else. Reveal runs on
 * phones (a gentle fade/rise); drift stays desktop-only like the existing
 * per-section default.
 */
export function siteSectionMotion(
	resolved: ResolvedSiteMotion | null,
	isFirstPart: boolean,
): SectionMotionConfig | undefined {
	if (!resolved) return undefined;
	const subtle = resolved.intensity === 'subtle';
	if (isFirstPart && resolved.heroParallax)
		return { effect: 'drift', intensity: subtle ? 16 : 32, phone: false };
	if (resolved.reveal) return { effect: 'reveal', intensity: subtle ? 24 : 45, phone: true };
	return undefined;
}
