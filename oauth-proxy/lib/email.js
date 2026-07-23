// Resend email helpers — the minimal paper/ink HTML shell used by /handoff, now shared
// with the magic-link sign-in mail. Content is always fixed server-side; callers control
// only the recipient (and only where the route's own rules allow it).

/** Shared minimal HTML shell — paper/ink, one Klein-blue button, no images. */
export function emailHtml(paragraphsBefore, buttonLabel, link, paragraphsAfter) {
	const p = (text) =>
		`<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1a1a1a;">${text}</p>`;
	return [
		`<div style="background:#faf8f5;padding:40px 24px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`,
		`<div style="max-width:480px;margin:0 auto;">`,
		...paragraphsBefore.map(p),
		`<p style="margin:24px 0;"><a href="${link}" style="display:inline-block;background:#002fa7;color:#faf8f5;text-decoration:none;border-radius:4px;padding:12px 22px;font-size:15px;font-weight:500;">${buttonLabel}</a></p>`,
		...paragraphsAfter.map(p),
		`</div></div>`,
	].join('');
}

/** Send via Resend. Returns true on success — callers decide how loud a failure is. */
export async function sendEmail(env, to, mail) {
	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
		});
		return res.ok;
	} catch {
		return false;
	}
}
