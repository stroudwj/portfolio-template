/** Stable CSS identifier shared by a sub-page thumbnail and that page's primary
 * gallery. Native View Transitions morph the two when supported. */
export function sharedPageTransitionName(pageKey: string): string {
	const safe = pageKey
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `hangwork-project-${safe || 'page'}`;
}

export function transitionInDocument(
	doc: Document,
	change: () => void,
	options?: { phone?: boolean },
): void {
	const win = doc.defaultView;
	if (
		win?.matchMedia('(prefers-reduced-motion: reduce)').matches ||
		(options?.phone === false && win?.matchMedia('(max-width: 639px)').matches)
	) {
		change();
		return;
	}
	const start = (
		doc as Document & {
			startViewTransition?: (
				callback: () => void | Promise<void>,
			) => { finished: Promise<void> };
		}
		).startViewTransition;
	if (!start) {
		change();
		return;
	}
	// A second click while a transition is running should still navigate instead
	// of throwing InvalidStateError and leaving the preview on the old page.
	if (doc.documentElement.dataset.pageTransitionActive === 'true') {
		change();
		return;
	}
	try {
		doc.documentElement.dataset.pageTransitionActive = 'true';
		const transition = start.call(doc, change);
		const clearActiveState = () => {
			delete doc.documentElement.dataset.pageTransitionActive;
		};
		// ViewTransition.finished rejects when navigation is superseded or the
		// browser aborts a capture. Handle both outcomes so an ordinary second
		// click never surfaces as an unhandled console error.
		void transition.finished.then(clearActiveState, clearActiveState);
	} catch {
		delete doc.documentElement.dataset.pageTransitionActive;
		change();
	}
}
