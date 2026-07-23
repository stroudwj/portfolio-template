// The editor door on phones. Arranging pieces on the freeform canvas is desktop work,
// so a phone gets two honest surfaces instead of a fiddly touch canvas:
//   1. The door screen — send-me-the-link cross-device handoff (auto-addressed for
//      buyers via their license key; typed email otherwise).
//   2. A read-only preview behind it ("look around"): the person's own draft when one
//      exists on this device, else the example portfolio — scroll and tap work, drag
//      does not, and a drag attempt answers with a gentle nudge.
// Deliberate: a half-working draggable canvas on a phone is worse than none.
//
// TODO(mobile-light-edit): a later flow should let phones add a piece to an EXISTING
// published gallery (photograph a finished work, hang it) — mount it from here, next
// to the read-only preview. First-build stays desktop-only.
import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import Portfolio from '../../portfolio/Portfolio';
import { PLACEHOLDER_IMAGE, docToPortfolioData, existingDoc } from '../lib/content-init';
import { getLicense } from '../lib/license/session';
import { HANDOFF_SENT_EVENT, HandoffError, desktopLinkUrl, justSentTo, sendDesktopLink } from '../lib/license/handoff';
import { isEmail } from '../lib/validation';
import type { LicenseSession } from './useLicense';

const NUDGE_TEXT =
	'Hanging works best on a bigger screen. Take a look around for now — I’ll email you a link to arrange everything on your computer.';

const NUDGE_COOLDOWN_MS = 8000;
const NUDGE_SHOWN_MS = 5000;
const DRAG_INTENT_PX = 16;
const LONG_PRESS_MS = 550;

/** An empty frame with no caption — stands in for pieces not present on this device. */
const READONLY_PLACEHOLDER =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='320'%3E%3Crect width='100%25' height='100%25' fill='%23e4e4e4'/%3E%3C/svg%3E";

type Phase = 'door' | 'sent' | 'browse';

export default function MobileDoor({ license, base, brandLockup }: { license: LicenseSession; base: string; brandLockup: string }) {
	const { doc, hasDraft, resumeDraft } = useEditor();
	// Paid is an account property: an activated (or stored, pending re-check) license.
	const paid = license.status === 'licensed' || Boolean(getLicense());

	// A fresh purchase auto-sends the post-purchase email (useLicense) — open on the
	// confirmation then, not on a door asking them to do it again.
	const [phase, setPhase] = useState<Phase>(() => (justSentTo() ? 'sent' : 'door'));
	const [sentTo, setSentTo] = useState<string | null>(() => justSentTo());
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);
	// After a failed send we show the same link to copy instead — never a dead end.
	const [copyFallback, setCopyFallback] = useState(false);
	const [copied, setCopied] = useState(false);

	// A checkout return auto-sends the post-purchase email after this mounts — flip to
	// the confirmation when that lands (unless the person already went off to browse).
	useEffect(() => {
		const onSent = (e: Event) => {
			setSentTo((e as CustomEvent<string>).detail || null);
			setPhase((p) => (p === 'browse' ? p : 'sent'));
		};
		window.addEventListener(HANDOFF_SENT_EVENT, onSent);
		return () => window.removeEventListener(HANDOFF_SENT_EVENT, onSent);
	}, []);

	// Read-only preview source: the draft on this device if there is one, else the
	// example portfolio (held locally — nothing is created or saved on a phone).
	useEffect(() => {
		if (!doc && hasDraft) void resumeDraft();
	}, [doc, hasDraft, resumeDraft]);
	const [exampleDoc] = useState(() => existingDoc());
	const previewDoc = doc ?? (hasDraft ? null : exampleDoc);
	const [page, setPage] = useState('home');

	const send = async () => {
		if (!paid && !isEmail(email)) {
			setNote('That email doesn’t look complete yet.');
			return;
		}
		setBusy(true);
		setNote(null);
		try {
			const result = await sendDesktopLink(paid ? undefined : email);
			setSentTo(result.email || (paid ? null : email.trim()));
			setPhase('sent');
			setCopyFallback(false);
		} catch (err) {
			setNote(err instanceof HandoffError ? err.friendly : 'Email is being quiet right now. Copy the link instead — it opens the same canvas.');
			setCopyFallback(true);
		} finally {
			setBusy(false);
		}
	};

	const copyLink = async () => {
		const link = desktopLinkUrl();
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
		} catch {
			// Clipboard blocked — the visible link input below stays selectable by hand.
			setCopied(false);
		}
	};

	// Drag-attempt detection on the read-only preview: a mostly-horizontal pull or a
	// long-press on a piece reads as "trying to arrange" and gets the nudge. Vertical
	// movement is scrolling and taps are looking around — both stay untouched.
	const [nudge, setNudge] = useState(false);
	const lastNudge = useRef(0);
	const touchState = useRef<{ x: number; y: number; timer: number } | null>(null);
	const nudgeTimer = useRef(0);

	const showNudge = () => {
		const now = Date.now();
		if (now - lastNudge.current < NUDGE_COOLDOWN_MS) return;
		lastNudge.current = now;
		setNudge(true);
		window.clearTimeout(nudgeTimer.current);
		nudgeTimer.current = window.setTimeout(() => setNudge(false), NUDGE_SHOWN_MS);
	};
	useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);

	const clearTouch = () => {
		if (touchState.current) window.clearTimeout(touchState.current.timer);
		touchState.current = null;
	};
	const onTouchStart = (e: React.TouchEvent) => {
		const target = e.target as HTMLElement;
		if (!target.closest('.canvas-item, .canvas-gallery, figure, img')) return;
		const t = e.touches[0];
		clearTouch();
		touchState.current = { x: t.clientX, y: t.clientY, timer: window.setTimeout(showNudge, LONG_PRESS_MS) };
	};
	const onTouchMove = (e: React.TouchEvent) => {
		const start = touchState.current;
		if (!start) return;
		const t = e.touches[0];
		const dx = Math.abs(t.clientX - start.x);
		const dy = Math.abs(t.clientY - start.y);
		if (dx > DRAG_INTENT_PX && dx > dy * 1.2) {
			clearTouch();
			showNudge();
		} else if (dy > DRAG_INTENT_PX) {
			clearTouch(); // scrolling
		}
	};

	const data = previewDoc ? docToPortfolioData(previewDoc) : null;
	if (data) {
		// The editor's placeholder says "Upload image" — a prompt this read-only view
		// can't honor. Swap in a plain empty frame.
		const neutral = (src: string) => (src === PLACEHOLDER_IMAGE ? READONLY_PLACEHOLDER : src);
		for (const list of Object.values(data.galleries)) for (const img of list) img.src = neutral(img.src);
		if (data.profileImageSrc) data.profileImageSrc = neutral(data.profileImageSrc);
		const thumbs = data.pageThumbs ?? {};
		for (const key of Object.keys(thumbs)) thumbs[key] = neutral(thumbs[key]);
	}
	const currentKey = previewDoc?.content.pages[page] ? page : 'home';

	const door = phase !== 'browse' && (
		<div className="mobile-door" role="dialog" aria-label="Continue on a computer">
			<div className="mobile-door-card">
				<img className="mobile-door-brand" src={brandLockup} alt="Hangwork" />
				{phase === 'sent' ? (
					<>
						<h1>On its way.</h1>
						<p>Check your email on your computer when you’re ready. The canvas will be waiting — no rush.</p>
						{sentTo && <p className="mobile-door-note">Sent to {sentTo}</p>}
						<button type="button" className="btn-link mobile-door-resend" onClick={send} disabled={busy}>
							{busy ? 'Sending it again…' : 'Send it again'}
						</button>
					</>
				) : paid ? (
					<>
						<h1>Your space is saved. Let’s hang it on a bigger wall.</h1>
						<p>
							Everything you’ve bought is in your account — nothing to redo, nothing lost. Arranging your pieces
							just wants a larger screen than a phone can give.
						</p>
						<p>I’ll send you a link. Open it on your computer and the canvas will be exactly where you left it.</p>
						<button type="button" className="btn-primary mobile-door-send" onClick={send} disabled={busy}>
							{busy ? 'Sending…' : 'Send me the link'}
						</button>
					</>
				) : (
					<>
						<h1>This part wants a bigger wall.</h1>
						<p>
							Arranging your pieces on the canvas is hands-on work — the kind that wants room to move. It’s built
							for a larger screen, where you can see the whole wall at once.
						</p>
						<p>
							Leave your email and I’ll send you a link. Open it on your computer and you’ll pick up right where
							the canvas is waiting.
						</p>
						<label className="field">
							<span className="field-label">Email</span>
							<input
								className="text-input"
								type="email"
								inputMode="email"
								autoComplete="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && send()}
							/>
						</label>
						<button type="button" className="btn-primary mobile-door-send" onClick={send} disabled={busy}>
							{busy ? 'Sending…' : 'Send me the link'}
						</button>
					</>
				)}
				{note && phase !== 'sent' && <p className="mobile-door-note">{note}</p>}
				{copyFallback && phase !== 'sent' && (
					<div className="mobile-door-copy">
						<button type="button" className="btn-secondary" onClick={copyLink}>
							{copied ? 'Copied — open it on your computer' : 'Copy the link'}
						</button>
						<input
							className="text-input mobile-door-link"
							readOnly
							value={desktopLinkUrl()}
							onFocus={(e) => e.currentTarget.select()}
							aria-label="Your Hangwork link"
						/>
					</div>
				)}
				<button type="button" className="mobile-door-sub" onClick={() => setPhase('browse')}>
					You can look around from here — the building happens on a desktop.
				</button>
			</div>
		</div>
	);

	return (
		<div className="mobile-gate">
			{door}
			<div className="mobile-gate-preview" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={clearTouch} onTouchCancel={clearTouch}>
				{data && (
					<Portfolio
						page={currentKey}
						content={data.content}
						galleries={data.galleries}
						profileImageSrc={data.profileImageSrc}
						logoImageSrc={data.logoImageSrc}
						pageThumbs={data.pageThumbs}
						productImageSrcs={data.productImageSrcs}
						fontFaces={data.fontFaces}
						resumeHref={data.resumeHref}
						base={base}
						onNavigate={(path) => setPage(path === '' ? 'home' : path)}
					/>
				)}
			</div>
			{phase === 'browse' && (
				<div className="mobile-gate-bar">
					<span>Building happens on a desktop.</span>
					<button type="button" className="btn-primary" onClick={() => setPhase(sentTo ? 'sent' : 'door')}>
						{sentTo ? 'Link sent ✓' : 'Send me the link'}
					</button>
				</div>
			)}
			{nudge && (
				<div className="mobile-gate-nudge" role="status">
					{NUDGE_TEXT}
				</div>
			)}
		</div>
	);
}
