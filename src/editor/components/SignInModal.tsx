// Sign in to Hangwork — the account door that replaces ConnectGitHubModal. Passwordless:
// a magic link to any email, or one click with Google (when configured). Either way the
// Worker answers with the same session, so the editor never learns which door was used.
import { useState } from 'react';
import { Modal } from './ui/Modal';
import { AccountError } from '../lib/account/client';

export default function SignInModal({
	onClose,
	sendMagicLink,
	signInWithGoogle,
	googleEnabled,
}: {
	onClose: () => void;
	sendMagicLink: (email: string) => Promise<void>;
	signInWithGoogle: () => void;
	googleEnabled: boolean;
}) {
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

	const submit = async () => {
		if (!emailLooksValid || busy) return;
		setBusy(true);
		setError(null);
		try {
			await sendMagicLink(email.trim());
			setSentTo(email.trim());
		} catch (err) {
			setError(err instanceof AccountError ? err.friendly : 'The sign-in email couldn’t be sent. Please try again.');
		} finally {
			setBusy(false);
		}
	};

	// ---- "Check your email" screen ----
	if (sentTo) {
		return (
			<Modal
				title="Check your email"
				onClose={onClose}
				footer={
					<button type="button" className="btn-primary" onClick={onClose}>
						Done
					</button>
				}
			>
				<p className="modal-lead">
					A sign-in link is on its way to <strong>{sentTo}</strong>. Open it on this device and you’ll land right
					back here, signed in.
				</p>
				<p className="modal-note">
					The link works once and expires in 15 minutes. Nothing arrives? Check spam, or{' '}
					<button type="button" className="btn-link" onClick={() => setSentTo(null)}>
						try a different address
					</button>
					.
				</p>
			</Modal>
		);
	}

	return (
		<Modal
			title="Claim your space"
			onClose={onClose}
			dismissable={!busy}
			footer={
				<>
					<button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
						Cancel
					</button>
					<button type="button" className="btn-primary" onClick={submit} disabled={busy || !emailLooksValid}>
						{busy ? 'Sending…' : 'Email me a sign-in link'}
					</button>
				</>
			}
		>
			<p className="modal-lead">
				A free account is where your site lives — publish from any device, come back anytime. No password:
				we email you a link that signs you in.
			</p>

			{googleEnabled && (
				<>
					<button type="button" className="btn-primary btn-authorize" onClick={signInWithGoogle}>
						Continue with Google ↗
					</button>
					<p className="modal-note">Or use any email address:</p>
				</>
			)}

			<label className="field">
				<span className="field-label">Email address</span>
				<input
					className={`text-input${error ? ' invalid' : ''}`}
					type="email"
					autoComplete="email"
					placeholder="you@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && void submit()}
				/>
				{error && <span className="field-error">{error}</span>}
			</label>

			<p className="modal-note">
				Bought Hangwork already? Sign in with the same email you used at checkout and your license comes with you.
			</p>
		</Modal>
	);
}
