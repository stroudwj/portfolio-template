const TOUR_COMPLETE_KEY = 'portfolio-editor:onboarding-tour-v1-complete';
const TOUR_PENDING_KEY = 'portfolio-editor:onboarding-tour-v1-pending';

// Storage can be disabled or full. Keep the current page flow working in memory
// even when the browser cannot remember it across reloads.
let pendingInMemory = false;
let completedInMemory = false;

function read(storage: Storage | undefined, key: string): string | null {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function write(storage: Storage | undefined, key: string, value: string) {
	try {
		storage?.setItem(key, value);
	} catch {
		/* The in-memory flags still cover this editor session. */
	}
}

function remove(storage: Storage | undefined, key: string) {
	try {
		storage?.removeItem(key);
	} catch {
		/* Nothing else to clear. */
	}
}

function local(): Storage | undefined {
	return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function session(): Storage | undefined {
	return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
}

export function hasCompletedEditorTour(): boolean {
	return completedInMemory || read(local(), TOUR_COMPLETE_KEY) === '1';
}

/** Queue the tour for a site created from Blank, Example, or a starter. */
export function requestFirstRunEditorTour() {
	if (hasCompletedEditorTour()) return;
	pendingInMemory = true;
	write(session(), TOUR_PENDING_KEY, '1');
}

/** Consume once after the Start screen has handed control to the editor shell. */
export function consumeFirstRunEditorTour(): boolean {
	const pending = pendingInMemory || read(session(), TOUR_PENDING_KEY) === '1';
	pendingInMemory = false;
	remove(session(), TOUR_PENDING_KEY);
	if (!pending || hasCompletedEditorTour()) return false;
	return true;
}

/** Skip and Finish both count as seen; replay remains available from Help. */
export function completeEditorTour() {
	completedInMemory = true;
	pendingInMemory = false;
	write(local(), TOUR_COMPLETE_KEY, '1');
	remove(session(), TOUR_PENDING_KEY);
}
