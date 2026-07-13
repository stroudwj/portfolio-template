// Tiny form primitives shared by every editor section.
import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

export function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: ReactNode;
	error?: string;
	children: ReactNode;
}) {
	return (
		<label className="field">
			<span className="field-label">{label}</span>
			{children}
			{hint && !error && <span className="field-hint">{hint}</span>}
			{error && <span className="field-error">{error}</span>}
		</label>
	);
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
	return <input className="text-input" {...props} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea className="text-area" {...props} />;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
	return (
		<section className="editor-section">
			<header className="editor-section-head">
				<h2>{title}</h2>
				{action}
			</header>
			{children}
		</section>
	);
}
