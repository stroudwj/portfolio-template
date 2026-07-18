// The optional site footer — a small centered line (or a few) at the very
// bottom of every page, typically a copyright notice or credits. Lives in
// content.site.footer; absent or empty means no footer at all.
import { TextLines } from './TextBlock';
import './Footer.css';

export default function Footer({ text }: { text: string }) {
	if (!text.trim()) return null;
	return (
		<footer className="site-footer">
			<p>
				<TextLines text={text} />
			</p>
		</footer>
	);
}
