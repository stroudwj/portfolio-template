import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from 'react';
import {
	completeEditorTour,
	consumeFirstRunEditorTour,
} from '../lib/onboarding';

type TourTab = 'pages' | 'design' | 'site' | 'publish';
type EditorView = 'edit' | 'preview';

interface TourStep {
	tab: TourTab;
	view: EditorView;
	target: string;
	title: string;
	body: string;
}

const TOUR_STEPS: TourStep[] = [
	{
		tab: 'pages',
		view: 'edit',
		target: '[data-tour="tab-pages"]',
		title: 'Build your site page by page',
		body: 'Choose Pages to replace images, edit text, add video, and organize what visitors can explore.',
	},
	{
		tab: 'pages',
		view: 'preview',
		target: '[data-tour="preview-toolbar"]',
		title: 'See every change live',
		body: 'Your site updates here as you work. Switch between Desktop and Phone to check the finished layout.',
	},
	{
		tab: 'design',
		view: 'edit',
		target: '[data-tour="tab-design"]',
		title: 'Make the presentation yours',
		body: 'Choose your layout, colors, type, header, and visual effects in Design.',
	},
	{
		tab: 'site',
		view: 'edit',
		target: '[data-tour="tab-site"]',
		title: 'Add the finishing details',
		body: 'Use Site for your name, identity, footer, and the details people see when your work is shared.',
	},
	{
		tab: 'publish',
		view: 'edit',
		target: '[data-tour="tab-publish"]',
		title: 'Publish only when you are ready',
		body: 'Choose your address, review any reminders, and put the site online here. Nothing goes live until you say so.',
	},
];

interface Rect {
	top: number;
	right: number;
	bottom: number;
	left: number;
	width: number;
	height: number;
}

interface BubbleSize {
	width: number;
	height: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), Math.max(min, max));
}

function placeBubble(
	target: Rect | null,
	size: BubbleSize,
): { left: number; top: number; placement: 'left' | 'right' | 'above' | 'below' | 'center' } {
	const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth;
	const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
	const margin = 16;
	const gap = 16;
	const width = Math.min(size.width || 340, viewportWidth - margin * 2);
	const height = Math.min(size.height || 230, viewportHeight - margin * 2);

	if (!target)
		return {
			left: Math.max(margin, (viewportWidth - width) / 2),
			top: Math.max(margin, (viewportHeight - height) / 2),
			placement: 'center',
		};

	const centeredTop = clamp(
		target.top + target.height / 2 - height / 2,
		margin,
		viewportHeight - height - margin,
	);
	const centeredLeft = clamp(
		target.left + target.width / 2 - width / 2,
		margin,
		viewportWidth - width - margin,
	);

	if (viewportWidth - target.right >= width + gap)
		return { left: target.right + gap, top: centeredTop, placement: 'right' };
	if (target.left >= width + gap)
		return { left: target.left - width - gap, top: centeredTop, placement: 'left' };
	if (viewportHeight - target.bottom >= height + gap)
		return { left: centeredLeft, top: target.bottom + gap, placement: 'below' };
	if (target.top >= height + gap)
		return { left: centeredLeft, top: target.top - height - gap, placement: 'above' };

	return {
		left: Math.max(margin, (viewportWidth - width) / 2),
		top: Math.max(margin, (viewportHeight - height) / 2),
		placement: 'center',
	};
}

export default function OnboardingTour({
	replayToken,
	onSelectTab,
	onSetView,
	onExit,
	onFinish,
}: {
	replayToken: number;
	onSelectTab: (tab: TourTab) => void;
	onSetView: (view: EditorView) => void;
	onExit: () => void;
	onFinish: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [stepIndex, setStepIndex] = useState(0);
	const [targetRect, setTargetRect] = useState<Rect | null>(null);
	const [bubbleSize, setBubbleSize] = useState<BubbleSize>({ width: 340, height: 230 });
	const bubbleRef = useRef<HTMLDivElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);
	const replaySeenRef = useRef(replayToken);
	const navigationRef = useRef({ onSelectTab, onSetView });
	const titleId = useId();
	const bodyId = useId();
	navigationRef.current = { onSelectTab, onSetView };

	const begin = () => {
		setStepIndex(0);
		setOpen(true);
	};

	useEffect(() => {
		if (consumeFirstRunEditorTour()) begin();
	}, []);

	useEffect(() => {
		if (replayToken === replaySeenRef.current) return;
		replaySeenRef.current = replayToken;
		begin();
	}, [replayToken]);

	const step = TOUR_STEPS[stepIndex];

	// Each step puts the editor in the state that makes its target meaningful.
	useEffect(() => {
		if (!open) return;
		navigationRef.current.onSelectTab(step.tab);
		navigationRef.current.onSetView(step.view);
	}, [open, stepIndex, step.tab, step.view]);

	// Targets can move when a tab opens, the left pane scrolls, or the layout
	// switches between Edit and Preview. Keep the spotlight attached.
	useEffect(() => {
		if (!open) {
			setTargetRect(null);
			return;
		}
		let frame = 0;
		let settleTimer = 0;
		let observed: Element | null = null;
		let observer: ResizeObserver | null = null;

		const measure = () => {
			const target = document.querySelector(step.target);
			if (target !== observed) {
				observer?.disconnect();
				observed = target;
				if (target && typeof ResizeObserver !== 'undefined') {
					observer = new ResizeObserver(scheduleMeasure);
					observer.observe(target);
				}
			}
			const box = target?.getBoundingClientRect();
			if (!box || box.width === 0 || box.height === 0) {
				setTargetRect(null);
				return;
			}
			setTargetRect({
				top: box.top,
				right: box.right,
				bottom: box.bottom,
				left: box.left,
				width: box.width,
				height: box.height,
			});
		};
		const scheduleMeasure = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};

		scheduleMeasure();
		settleTimer = window.setTimeout(scheduleMeasure, 100);
		window.addEventListener('resize', scheduleMeasure);
		window.addEventListener('scroll', scheduleMeasure, true);
		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(settleTimer);
			observer?.disconnect();
			window.removeEventListener('resize', scheduleMeasure);
			window.removeEventListener('scroll', scheduleMeasure, true);
		};
	}, [open, step.target]);

	useEffect(() => {
		if (!open || !bubbleRef.current || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(([entry]) => {
			setBubbleSize({
				width: entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width,
				height: entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
			});
		});
		observer.observe(bubbleRef.current);
		return () => observer.disconnect();
	}, [open]);

	const skip = () => {
		completeEditorTour();
		setOpen(false);
		onExit();
	};

	const finish = () => {
		completeEditorTour();
		setOpen(false);
		onFinish();
	};

	// The tour is modal even though its shape follows the highlighted control.
	useEffect(() => {
		if (!open) return;
		previousFocusRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const dialog = bubbleRef.current;
		const focusableSelector =
			'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				skip();
				return;
			}
			if (event.key !== 'Tab' || !dialog) return;
			const focusable = Array.from(
				dialog.querySelectorAll<HTMLElement>(focusableSelector),
			).filter((element) => element.getClientRects().length > 0);
			if (!focusable.length) {
				event.preventDefault();
				dialog.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKeyDown);
		const frame = requestAnimationFrame(() => dialog?.focus());
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener('keydown', onKeyDown);
			const previous = previousFocusRef.current;
			if (previous?.isConnected) previous.focus();
		};
	}, [open]);

	const position = useMemo(
		() => placeBubble(targetRect, bubbleSize),
		[targetRect, bubbleSize],
	);
	const spotlight = targetRect
		? {
				top: Math.max(8, targetRect.top - 7),
				left: Math.max(8, targetRect.left - 7),
				width: Math.min(
					window.innerWidth - Math.max(8, targetRect.left - 7) - 8,
					targetRect.width + 14,
				),
				height: Math.min(
					window.innerHeight - Math.max(8, targetRect.top - 7) - 8,
					targetRect.height + 14,
				),
			}
		: null;

	if (!open) return null;

	return (
		<div className="editor-tour-layer">
			<div
				className={`editor-tour-backdrop ${spotlight ? '' : 'solid'}`}
				aria-hidden="true"
			/>
			{spotlight && (
				<div
					className="editor-tour-spotlight"
					aria-hidden="true"
					style={spotlight}
				/>
			)}
			<div
				ref={bubbleRef}
				className="editor-tour-bubble"
				data-placement={position.placement}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={bodyId}
				aria-live="polite"
				tabIndex={-1}
				style={
					{
						left: position.left,
						top: position.top,
					} as CSSProperties
				}
			>
				<div className="editor-tour-meta">
					<span className="editor-tour-count">
						{stepIndex + 1}/{TOUR_STEPS.length}
					</span>
					<button type="button" className="editor-tour-skip" onClick={skip}>
						Skip tour
					</button>
				</div>
				<h2 id={titleId}>{step.title}</h2>
				<p id={bodyId}>{step.body}</p>
				<div className="editor-tour-progress" aria-hidden="true">
					{TOUR_STEPS.map((_, index) => (
						<span
							key={index}
							className={index === stepIndex ? 'active' : index < stepIndex ? 'complete' : ''}
						/>
					))}
				</div>
				<footer className="editor-tour-actions">
					<button
						type="button"
						className="btn-ghost"
						onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
						disabled={stepIndex === 0}
					>
						Back
					</button>
					{stepIndex === TOUR_STEPS.length - 1 ? (
						<button type="button" className="btn-primary" onClick={finish}>
							Let’s get started
						</button>
					) : (
						<button
							type="button"
							className="btn-primary"
							onClick={() =>
								setStepIndex((current) => Math.min(TOUR_STEPS.length - 1, current + 1))
							}
						>
							Next
						</button>
					)}
				</footer>
			</div>
		</div>
	);
}
