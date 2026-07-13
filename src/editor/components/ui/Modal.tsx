// A minimal centered modal used by the Connect-GitHub and Publish flows.
import type { ReactNode } from 'react';
import { useEffect } from 'react';

export function Modal({
	title,
	onClose,
	children,
	footer,
	dismissable = true,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
	/** When false (e.g. mid-publish), backdrop clicks and Esc don't close it. */
	dismissable?: boolean;
}) {
	useEffect(() => {
		if (!dismissable) return;
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [dismissable, onClose]);

	return (
		<div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => dismissable && onClose()}>
			<div className="modal-card" onClick={(e) => e.stopPropagation()}>
				<header className="modal-head">
					<h2>{title}</h2>
					{dismissable && (
						<button type="button" className="btn-icon" aria-label="Close" onClick={onClose}>
							×
						</button>
					)}
				</header>
				<div className="modal-body">{children}</div>
				{footer && <footer className="modal-foot">{footer}</footer>}
			</div>
		</div>
	);
}
