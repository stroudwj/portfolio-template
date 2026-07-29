import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(initial: Readonly<Record<string, string>> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		api: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key),
		},
	};
}

describe('first-run editor tour', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('queues a new-site tour and consumes it exactly once', async () => {
		const local = storage();
		const session = storage();
		vi.stubGlobal('localStorage', local.api);
		vi.stubGlobal('sessionStorage', session.api);
		const onboarding = await import('../src/editor/lib/onboarding');

		onboarding.requestFirstRunEditorTour();

		expect(onboarding.consumeFirstRunEditorTour()).toBe(true);
		expect(onboarding.consumeFirstRunEditorTour()).toBe(false);
	});

	it('does not queue the automatic tour after it has been completed', async () => {
		const local = storage();
		const session = storage();
		vi.stubGlobal('localStorage', local.api);
		vi.stubGlobal('sessionStorage', session.api);
		const onboarding = await import('../src/editor/lib/onboarding');

		onboarding.requestFirstRunEditorTour();
		expect(onboarding.consumeFirstRunEditorTour()).toBe(true);
		onboarding.completeEditorTour();

		vi.resetModules();
		const reloaded = await import('../src/editor/lib/onboarding');
		expect(reloaded.hasCompletedEditorTour()).toBe(true);
		reloaded.requestFirstRunEditorTour();
		expect(reloaded.consumeFirstRunEditorTour()).toBe(false);
	});

	it('still works for the current session when browser storage is blocked', async () => {
		const blocked = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			},
		};
		vi.stubGlobal('localStorage', blocked);
		vi.stubGlobal('sessionStorage', blocked);
		const onboarding = await import('../src/editor/lib/onboarding');

		expect(() => onboarding.requestFirstRunEditorTour()).not.toThrow();
		expect(onboarding.consumeFirstRunEditorTour()).toBe(true);
		expect(() => onboarding.completeEditorTour()).not.toThrow();
		expect(onboarding.hasCompletedEditorTour()).toBe(true);
	});
});
