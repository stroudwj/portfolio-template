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

/* ---- Crop & light demo: the workbench first-run's practice offer. Opening,
   finishing, or declining it all count as seen — the prominent offer card
   gives way to the quiet link and the demo itself never auto-opens. ---- */

const CROP_LIGHT_DEMO_KEY = 'portfolio-editor:crop-light-demo-v1-seen';

let cropLightDemoSeenInMemory = false;

export function hasSeenCropLightDemo(): boolean {
	return cropLightDemoSeenInMemory || read(local(), CROP_LIGHT_DEMO_KEY) === '1';
}

export function markCropLightDemoSeen() {
	cropLightDemoSeenInMemory = true;
	write(local(), CROP_LIGHT_DEMO_KEY, '1');
}

/* ---- Intake intent: the Start questionnaire's routing answers, consumed
   once by the editor shell right after the new document opens. ---- */

const INTAKE_INTENT_KEY = 'portfolio-editor:intake-intent-v1';

export interface IntakeIntent {
	/** 'pile' = sort in the workbench first; 'organized' = straight to the wall. */
	workflow?: 'pile' | 'organized';
	/** The artist said some photos still need a crop or light pass. */
	finishing?: boolean;
	/** Offer the "Save your setup" account door once the editor opens. */
	promptSignup?: boolean;
	/** Which starter the intake applied (null = blank) — picks the sample
	 * artwork that fills series pages when the artist leaves with no photos. */
	starterId?: string | null;
}

let intakeInMemory: IntakeIntent | null = null;

export function writeIntakeIntent(intent: IntakeIntent) {
	intakeInMemory = intent;
	write(session(), INTAKE_INTENT_KEY, JSON.stringify(intent));
}

/* ---- Post-build quick guide: the one-screen tour of core editor moves shown
   right after "OK — build my pages" hangs the first pages. Dismissing it (or
   finishing a later build with it already seen) retires it for good — it never
   auto-reopens. ---- */

const BUILD_GUIDE_KEY = 'portfolio-editor:workbench-build-guide-v1-seen';

let buildGuideSeenInMemory = false;

export function hasSeenWorkbenchBuildGuide(): boolean {
	return buildGuideSeenInMemory || read(local(), BUILD_GUIDE_KEY) === '1';
}

export function markWorkbenchBuildGuideSeen() {
	buildGuideSeenInMemory = true;
	write(local(), BUILD_GUIDE_KEY, '1');
}

export function consumeIntakeIntent(): IntakeIntent | null {
	const raw = read(session(), INTAKE_INTENT_KEY);
	const intent =
		intakeInMemory ??
		(raw
			? (() => {
					try {
						return JSON.parse(raw) as IntakeIntent;
					} catch {
						return null;
					}
				})()
			: null);
	intakeInMemory = null;
	remove(session(), INTAKE_INTENT_KEY);
	return intent;
}
