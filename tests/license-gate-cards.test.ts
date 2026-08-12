// The checkout plan cards sell with check-mark feature lists, and William's content rule
// is a hard one: a plan card lists only what the plan INCLUDES. A feature a plan lacks is
// simply absent — there is never a struck-out / "not included" / "everything except" row.
// These are source assertions because the cards are pure JSX with no branching worth
// mounting; they exist so a future copy edit can't quietly reintroduce negative framing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modal = readFileSync(new URL('../src/editor/components/LicenseGateModal.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/editor/editor.css', import.meta.url), 'utf8');
const icons = readFileSync(new URL('../src/editor/components/ui/panel-icons.tsx', import.meta.url), 'utf8');

describe('license gate plan cards', () => {
	it('lists features as check rows, not prose paragraphs', () => {
		expect(modal).toContain('className="checkout-features"');
		expect(modal.match(/<Feature\b/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
		expect(modal).toContain('<PanelIcon type="check" />');
		expect(icons).toMatch(/\n\tcheck: <path /); // an inline outline tick, no emoji, nothing external
	});

	it('never renders a "not included" row — positive framing only', () => {
		for (const banned of ['everything except', 'not included', 'no downloads', '✕', '✗']) {
			expect(modal.toLowerCase()).not.toContain(banned.toLowerCase());
		}
		// No cross/negative variant of the row styling either.
		expect(css).not.toMatch(/checkout-feature\.(missing|excluded|off)/);
	});

	it('keeps downloads as a lifetime-only check row', () => {
		expect(modal).toContain('<Feature>Site and backup downloads</Feature>');
		// One occurrence only: it must not appear on the monthly card.
		expect(modal.match(/Site and backup downloads/g)).toHaveLength(1);
	});

	it('orders the cards cheap-to-premium: monthly left, lifetime right', () => {
		const monthly = modal.indexOf("aria-pressed={selectedPlan === 'monthly'}");
		const lifetime = modal.indexOf("aria-pressed={selectedPlan === 'lifetime'}");
		expect(monthly).toBeGreaterThan(-1);
		expect(lifetime).toBeGreaterThan(monthly);
		// The stacked (<=480px) layout is a one-column grid, so DOM order is the
		// only thing deciding it — nothing may reorder the cards visually.
		expect(css).not.toMatch(/\.checkout-option[^{]*\{[^}]*(^|[\s;])order:/m);
		expect(css).not.toMatch(/\.checkout-options\s*\{[^}]*(row|column)-reverse/);
	});

	it('references monthly from the lifetime card instead of repeating its rows', () => {
		// Lifetime lists three rows only: the reference + its two extras.
		const lifetimeCard = modal.slice(modal.indexOf("aria-pressed={selectedPlan === 'lifetime'}"));
		expect(lifetimeCard).toContain('<Feature>All of Monthly</Feature>');
		expect(lifetimeCard.match(/<Feature\b/g)).toHaveLength(3);
		// The shared list belongs to monthly now and is rendered exactly once.
		expect(modal).toContain('function MonthlyFeatures()');
		expect(modal.match(/<MonthlyFeatures \/>/g)).toHaveLength(1);
		expect(modal).not.toContain('SharedFeatures');
	});

	it('claims the free trial on monthly only — Polar trials are subscription-only', () => {
		// oauth-proxy/polar.js grants trial access from subscription.* webhooks with
		// status 'trialing'; a one-time lifetime order can never produce one, so a
		// trial row on the lifetime card would be a promise the backend cannot keep.
		const worker = readFileSync(new URL('../oauth-proxy/polar.js', import.meta.url), 'utf8');
		expect(worker).toMatch(/status !== 'trialing' && status !== 'active'/);
		expect(modal.match(/days free/g)).toHaveLength(1);
		const lifetimeCard = modal.slice(modal.indexOf("aria-pressed={selectedPlan === 'lifetime'}"));
		expect(lifetimeCard).not.toMatch(/days free|free trial/i);
	});

	it('keeps the trial cancellation caveat attached to the trial row', () => {
		expect(modal).toMatch(/note="Cancel before they end and pay nothing\."/);
		expect(modal).toContain('First {pricing.monthlyTrialDays} days free');
	});

	it('shows exactly the two existing plans and hardcodes no price', () => {
		expect(modal.match(/className=\{`checkout-option/g)).toHaveLength(2);
		expect(modal).not.toMatch(/\$\d/);
		expect(modal).not.toMatch(/\bFree\b\s*(plan|tier)|Enterprise/i);
	});

	it('paints the card from an editor token so the dark theme works', () => {
		expect(css).toMatch(/\.checkout-option\s*\{[^}]*background:\s*var\(--editor-panel\)/);
	});
});
