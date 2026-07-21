// A minimal centered modal used by the Connect-GitHub and Publish flows.
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

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
	const dialogRef = useRef<HTMLDivElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	const dismissableRef = useRef(dismissable);
	const titleId = useId();
	onCloseRef.current = onClose;
	dismissableRef.current = dismissable;

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const doc = dialog.ownerDocument;
		const active = doc.activeElement;
		previousFocusRef.current = active && 'focus' in active ? (active as HTMLElement) : null;
		const focusableSelector = [
			'a[href]',
			'button:not([disabled])',
			'input:not([disabled])',
			'select:not([disabled])',
			'textarea:not([disabled])',
			'[tabindex]:not([tabindex="-1"])',
		].join(',');
		const focusable = () =>
			Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
				(el) => el.getClientRects().length > 0,
			);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && dismissableRef.current) {
				e.preventDefault();
				onCloseRef.current();
				return;
			}
			if (e.key !== 'Tab') return;
			const targets = focusable();
			if (targets.length === 0) {
				e.preventDefault();
				dialog.focus();
				return;
			}
			const first = targets[0];
			const last = targets[targets.length - 1];
			const current = doc.activeElement;
			if (!dialog.contains(current)) {
				e.preventDefault();
				first.focus();
			} else if (e.shiftKey && (current === first || current === dialog)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && current === last) {
				e.preventDefault();
				first.focus();
			}
		};
		doc.addEventListener('keydown', onKey);
		const frame = doc.defaultView?.requestAnimationFrame(() => dialog.focus());
		return () => {
			doc.removeEventListener('keydown', onKey);
			if (frame !== undefined) doc.defaultView?.cancelAnimationFrame(frame);
			const previous = previousFocusRef.current;
			if (previous?.isConnected) previous.focus();
		};
	}, []);

	return (
		<div className="modal-overlay" onClick={() => dismissable && onClose()}>
			<div
				ref={dialogRef}
				className="modal-card"
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				onClick={(e) => e.stopPropagation()}
			>
				<header className="modal-head">
					<h2 id={titleId}>{title}</h2>
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
