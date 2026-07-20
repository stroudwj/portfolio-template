// The ✨ Fun tab: playful, entirely optional site-wide effects. Everything here
// writes content.site.creative, rendered by portfolio/CreativeEffects in the
// preview and on the published site.
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';
import type { CreativeTrail } from '../../lib/content';

/** Preset cursors — artist-flavored, one click each. */
const CURSORS = ['✏️', '🖌️', '✂️', '🌸', '⭐', '👁️', '🐌'];

const TRAILS: Array<{ value: CreativeTrail | ''; label: string }> = [
	{ value: '', label: 'Off' },
	{ value: 'sparkles', label: '✦ Sparkles' },
	{ value: 'hearts', label: '♥ Hearts' },
	{ value: 'bubbles', label: '○ Bubbles' },
];

export default function CreativeEditor() {
	const { doc, setCreative } = useEditor();
	if (!doc) return null;
	const creative = doc.content.site.creative ?? {};
	const cursor = creative.cursor ?? '';
	const grain = creative.grain ?? 0;

	return (
		<Section title="Fun & flourishes" sectionKey="_creative">
			<p className="muted" style={{ marginTop: 0 }}>
				Playful touches for your whole site — try them in the preview, keep what feels like you.
			</p>

			<Field label="Custom cursor" hint="Visitors browse your site with this instead of the normal arrow.">
				<div className="chip-row">
					<button
						type="button"
						className={`btn-icon btn-chip ${cursor === '' ? 'active' : ''}`}
						onClick={() => setCreative({ cursor: undefined })}
					>
						Off
					</button>
					{CURSORS.map((c) => (
						<button
							key={c}
							type="button"
							className={`btn-icon btn-chip cursor-chip ${cursor === c ? 'active' : ''}`}
							onClick={() => setCreative({ cursor: c })}
							aria-label={`Use ${c} as the cursor`}
						>
							{c}
						</button>
					))}
					<input
						className="text-input emoji-input"
						value={CURSORS.includes(cursor) ? '' : cursor}
						onChange={(e) => setCreative({ cursor: [...e.target.value].slice(0, 2).join('') || undefined })}
						placeholder="any emoji…"
						aria-label="Custom cursor emoji"
					/>
				</div>
			</Field>

			<Field label="Cursor trail" hint="Little shapes drift behind the pointer as visitors move it.">
				<div className="chip-row">
					{TRAILS.map((t) => (
						<button
							key={t.value || 'off'}
							type="button"
							className={`btn-icon btn-chip ${(creative.trail ?? '') === t.value ? 'active' : ''}`}
							onClick={() => setCreative({ trail: (t.value || undefined) as CreativeTrail | undefined })}
						>
							{t.label}
						</button>
					))}
				</div>
			</Field>

			<Field
				label="Paper grain"
				hint="A subtle paper texture over the whole site — like work pinned on real paper."
			>
				<div className="gap-row">
					<input
						type="range"
						min={0}
						max={30}
						step={1}
						value={grain}
						onChange={(e) => setCreative({ grain: Number(e.target.value) || undefined })}
						aria-label="Paper grain strength"
					/>
					<span className="gap-unit">{grain > 0 ? `${grain}%` : 'off'}</span>
				</div>
			</Field>
		</Section>
	);
}
