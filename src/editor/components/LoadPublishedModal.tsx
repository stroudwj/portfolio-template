// Pulls the user's live portfolio back into the editor. The published site carries its
// own editable source (_hw/content.json + _hw/files.json), so this just downloads it —
// all hosting specifics live behind loadPublishedSite; this component only shows
// progress and, on success, hands the finished doc to the editor.
import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui/Modal';
import type { EditorDoc } from '../lib/types';
import type { PublishProgress } from '../lib/exporter';
import { loadPublishedSite } from '../lib/account/load';
import type { AccountSiteSummary } from '../lib/account/session';
import { ProgressList, appendStep } from './ui/ProgressList';

type Phase = 'loading' | 'error';

export default function LoadPublishedModal({
	site,
	onClose,
	onLoaded,
}: {
	site: AccountSiteSummary | null;
	onClose: () => void;
	onLoaded: (doc: EditorDoc) => void | Promise<void>;
}) {
	const [phase, setPhase] = useState<Phase>('loading');
	const [log, setLog] = useState<PublishProgress[]>([]);
	const [error, setError] = useState<string | null>(null);
	const started = useRef(false);

	const run = async () => {
		setPhase('loading');
		setLog([]);
		setError(null);
		if (!site?.subdomain) {
			setError('This account hasn’t published a site yet. Publish once, then you can edit it from anywhere.');
			setPhase('error');
			return;
		}
		try {
			const doc = await loadPublishedSite(site, (p) => setLog((prev) => appendStep(prev, p)));
			await onLoaded(doc);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not load your site.');
			setPhase('error');
		}
	};

	// Kick off exactly once on mount (guard against StrictMode double-invoke).
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		void run();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (phase === 'error') {
		return (
			<Modal
				title="Couldn’t open your site"
				onClose={onClose}
				footer={
					<>
						<button type="button" className="btn-ghost" onClick={onClose}>
							Close
						</button>
						<button
							type="button"
							className="btn-primary"
							onClick={() => {
								started.current = true;
								void run();
							}}
						>
							Try again
						</button>
					</>
				}
			>
				<p className="publish-error">{error}</p>
			</Modal>
		);
	}

	return (
		<Modal title="Opening your published site…" onClose={onClose} dismissable={false}>
			<ProgressList log={log} />
		</Modal>
	);
}
