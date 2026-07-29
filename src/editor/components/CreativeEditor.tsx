// Optional site-wide visual effects in Design. Everything here
// writes content.site.creative, rendered by portfolio/CreativeEffects in the
// preview and on the published site.
import { useEditor } from '../store';
import { Field, Section } from './ui/controls';
import type {
	CreativeClickMark,
	CreativeEffectKey,
	CreativeTrail,
	FilmTexturePreset,
	PageTransition,
} from '../../lib/content';

/** Preset cursors — artist-flavored, one click each. */
const CURSORS = ['✏️', '🖌️', '✂️', '🌸', '⭐', '👁️', '🐌'];

const TRAILS: Array<{ value: CreativeTrail | ''; label: string }> = [
	{ value: '', label: 'Off' },
	{ value: 'sparkles', label: '✦ Sparkles' },
	{ value: 'hearts', label: '♥ Hearts' },
	{ value: 'bubbles', label: '○ Bubbles' },
];

const CLICK_MARKS: Array<{ value: CreativeClickMark | ''; label: string }> = [
	{ value: '', label: 'Off' },
	{ value: 'nail', label: '• Nail' },
	{ value: 'cross', label: '× Cross' },
	{ value: 'star', label: '✶ Star' },
];

const FILM_PRESETS: Array<{ value: FilmTexturePreset | ''; label: string }> = [
	{ value: '', label: 'Off' },
	{ value: 'fine-grain', label: 'Fine grain' },
	{ value: 'dust', label: 'Dust' },
	{ value: 'projector', label: 'Projector' },
];

const PAGE_TRANSITIONS: Array<{ value: PageTransition | ''; label: string }> = [
	{ value: '', label: 'Off' },
	{ value: 'fade', label: 'Fade' },
	{ value: 'slide', label: 'Glide' },
	{ value: 'curtain', label: 'Curtain' },
	{ value: 'gallery', label: 'Gallery morph' },
];

function OnOff({
	value,
	onChange,
	label,
}: {
	value: boolean;
	onChange(value: boolean): void;
	label: string;
}) {
	return (
		<div className="chip-row" role="group" aria-label={label}>
			<button
				type="button"
				className={`btn-icon btn-chip ${!value ? 'active' : ''}`}
				onClick={() => onChange(false)}
			>
				Off
			</button>
			<button
				type="button"
				className={`btn-icon btn-chip ${value ? 'active' : ''}`}
				onClick={() => onChange(true)}
			>
				On
			</button>
		</div>
	);
}

export default function CreativeEditor() {
	const { doc, setCreative } = useEditor();
	if (!doc) return null;
	const creative = doc.content.site.creative ?? {};
	const cursor = creative.cursor ?? '';
	const grain = creative.grain ?? 0;
	const film = creative.film;
	const setPhone = (key: CreativeEffectKey, enabled: boolean) => {
		const phone = { ...(creative.phone ?? {}) };
		if (enabled) delete phone[key];
		else phone[key] = false;
		setCreative({ phone: Object.keys(phone).length ? phone : undefined });
	};
	const phoneControl = (key: CreativeEffectKey) => (
		<label className="effect-phone-control">
			<input
				type="checkbox"
				checked={creative.phone?.[key] !== false}
				onChange={(event) => setPhone(key, event.target.checked)}
			/>
			Use on phones
		</label>
	);
	const patchFilm = (patch: Partial<NonNullable<typeof film>>) => {
		const preset = patch.preset ?? film?.preset ?? 'fine-grain';
		setCreative({
			film: {
				preset,
				intensity: 12,
				size: 100,
				speed: 100,
				...(preset === 'projector' ? { flicker: true, weave: true } : {}),
				...film,
				...patch,
			},
		});
	};

	return (
		<Section title="Motion & texture" sectionKey="_creative">
			<p className="muted" style={{ marginTop: 0 }}>
				Give the published site a point of view. Everything is opt-in and previews live.
			</p>

			<Field
				label="Living film texture"
				hint="A low-frame-rate grain surface with optional dust, flicker and projector movement."
			>
				<div className="chip-row" role="group" aria-label="Living film texture">
					{FILM_PRESETS.map((preset) => (
						<button
							key={preset.value || 'off'}
							type="button"
							className={`btn-icon btn-chip ${(film?.preset ?? '') === preset.value ? 'active' : ''}`}
							onClick={() =>
								preset.value
									? patchFilm({ preset: preset.value })
									: setCreative({ film: undefined })
							}
						>
							{preset.label}
						</button>
					))}
				</div>
				{film && (
					<div className="motion-control-stack">
						{phoneControl('film')}
						<label className="motion-range">
							<span>Intensity <output>{film.intensity ?? 12}%</output></span>
							<input
								type="range"
								min={1}
								max={30}
								step={1}
								value={film.intensity ?? 12}
								aria-label="Film texture intensity"
								onChange={(event) => patchFilm({ intensity: Number(event.target.value) })}
							/>
						</label>
						<label className="motion-range">
							<span>Grain size <output>{film.size ?? 100}%</output></span>
							<input
								type="range"
								min={50}
								max={200}
								step={5}
								value={film.size ?? 100}
								aria-label="Film grain size"
								onChange={(event) => patchFilm({ size: Number(event.target.value) })}
							/>
						</label>
						<label className="motion-range">
							<span>Frame speed <output>{film.speed ?? 100}%</output></span>
							<input
								type="range"
								min={25}
								max={200}
								step={5}
								value={film.speed ?? 100}
								aria-label="Film frame speed"
								onChange={(event) => patchFilm({ speed: Number(event.target.value) })}
							/>
						</label>
						<div className="motion-toggle-row">
							<span>Flicker</span>
							<OnOff
								label="Film flicker"
								value={film.flicker ?? false}
								onChange={(value) => patchFilm({ flicker: value || undefined })}
							/>
						</div>
						<div className="motion-toggle-row">
							<span>Gate weave</span>
							<OnOff
								label="Film gate weave"
								value={film.weave ?? false}
								onChange={(value) => patchFilm({ weave: value || undefined })}
							/>
						</div>
					</div>
				)}
			</Field>

			<Field
				label="Page transitions"
				hint="Choreograph page changes. Gallery morph connects a project thumbnail to its project page when supported."
			>
				<div className="chip-row" role="group" aria-label="Page transition">
					{PAGE_TRANSITIONS.map((transition) => (
						<button
							key={transition.value || 'off'}
							type="button"
							className={`btn-icon btn-chip ${(creative.pageTransition ?? '') === transition.value ? 'active' : ''}`}
							onClick={() =>
								setCreative({
									pageTransition: (transition.value || undefined) as PageTransition | undefined,
								})
							}
						>
							{transition.label}
						</button>
					))}
				</div>
				{creative.pageTransition && phoneControl('pageTransition')}
			</Field>

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
				{creative.trail && phoneControl('trail')}
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

			<Field label="Tap to mark" hint="Every click or tap leaves a small, temporary studio mark.">
				<div className="chip-row" role="group" aria-label="Tap to mark style">
					{CLICK_MARKS.map((mark) => (
						<button
							key={mark.value || 'off'}
							type="button"
							className={`btn-icon btn-chip ${(creative.clickMark ?? '') === mark.value ? 'active' : ''}`}
							onClick={() =>
								setCreative({ clickMark: (mark.value || undefined) as CreativeClickMark | undefined })
							}
						>
							{mark.label}
						</button>
					))}
				</div>
				{creative.clickMark && phoneControl('clickMark')}
			</Field>

			<Field label="Loose hang" hint="Tilts each piece by a fraction, like a wall hung by hand.">
				<OnOff
					label="Loose hang"
					value={creative.looseHang ?? false}
					onChange={(value) => setCreative({ looseHang: value || undefined })}
				/>
				{creative.looseHang && phoneControl('looseHang')}
			</Field>

			<Field label="Slow reveal" hint="Artwork fades in gently when each page opens.">
				<OnOff
					label="Slow reveal"
					value={creative.slowReveal ?? false}
					onChange={(value) => setCreative({ slowReveal: value || undefined })}
				/>
				{creative.slowReveal && phoneControl('slowReveal')}
			</Field>

			<Field label="Artwork wobble" hint="Pieces do a quick little shake when visitors hover over them.">
				<OnOff
					label="Artwork wobble"
					value={creative.artworkWobble ?? false}
					onChange={(value) => setCreative({ artworkWobble: value || undefined })}
				/>
				{creative.artworkWobble && phoneControl('artworkWobble')}
			</Field>

			<Field label="Color spin" hint="Hovering a piece sends its colors on one trip around the color wheel.">
				<OnOff
					label="Color spin"
					value={creative.colorSpin ?? false}
					onChange={(value) => setCreative({ colorSpin: value || undefined })}
				/>
				{creative.colorSpin && phoneControl('colorSpin')}
			</Field>
		</Section>
	);
}
