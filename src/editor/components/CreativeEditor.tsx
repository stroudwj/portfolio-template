// Optional site-wide visual effects in Design. Almost everything here writes
// content.site.creative, rendered by portfolio/CreativeEffects in the preview
// and on the published site; the Site motion dial writes content.theme.motion,
// the template-presettable motion vocabulary (portfolio/siteMotion.ts).
import { useState } from 'react';
import { useEditor } from '../store';
import { getAssetPreviewUrl } from '../lib/assets';
import { Field, HelpDisclosure, InspectorTabs, Section } from './ui/controls';
import { ImageDrop } from './ui/ImageDrop';
import type {
	CreativeClickMark,
	CreativeEffectKey,
	CreativeTrail,
	FilmTexturePreset,
	PageTransition,
	SectionMotionEffect,
	SiteMotionIntensity,
} from '../../lib/content';
import { SECTION_MOTION_CHOICES, nextSectionMotion } from './ui/SectionMotionPicker';

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

const SITE_MOTION: Array<{ value: SiteMotionIntensity; label: string }> = [
	{ value: 'off', label: 'Off' },
	{ value: 'subtle', label: 'Subtle' },
	{ value: 'full', label: 'Full' },
];

const PAGE_TRANSITIONS: Array<{ value: PageTransition | ''; label: string }> = [
	{ value: '', label: 'Off' },
	{ value: 'fade', label: 'Fade' },
	{ value: 'slide', label: 'Glide' },
	{ value: 'curtain', label: 'Curtain' },
	{ value: 'gallery', label: 'Gallery morph' },
];

const EFFECT_AREAS = [
	{ id: 'surface', label: 'Surface', meta: 'Wall & texture' },
	{ id: 'motion', label: 'Motion', meta: 'Reveal & hover' },
	{ id: 'pointer', label: 'Pointer', meta: 'Cursor & taps' },
] as const;

type EffectArea = (typeof EFFECT_AREAS)[number]['id'];

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
	const { doc, setCreative, setTheme, setCursorImage, removeCursorImage } = useEditor();
	const [area, setArea] = useState<EffectArea>('surface');
	if (!doc) return null;
	const creative = doc.content.site.creative ?? {};
	const cursor = creative.cursor ?? '';
	const cursorImageUrl = getAssetPreviewUrl(doc.cursorImage?.assetId);
	const hasCursorImage = Boolean(doc.cursorImage?.filename || creative.cursorImage);
	const grain = creative.grain ?? 0;
	const hangStrength = creative.hangStrength ?? 0.75;
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
		<Section title="Effects" sectionKey="_creative">
			<InspectorTabs
				items={EFFECT_AREAS}
				active={area}
				onChange={setArea}
				ariaLabel="Effect settings"
			/>
			<div className="inspector-panel effect-inspector-panel" role="tabpanel">

			{area === 'surface' && (
				<>
				<Field label="Hangpieces across the site">
				<div className="motion-control-stack prominent-hanging-control">
					<OnOff
						label="Hang artwork by default"
						value={creative.looseHang ?? false}
						onChange={(value) => setCreative({ looseHang: value || undefined })}
					/>
					{creative.looseHang && (
						<>
							<label className="motion-range">
								<span>
									Site tilt <output>{hangStrength.toFixed(2)}°</output>
								</span>
								<input
									type="range"
									min={0.25}
									max={5}
									step={0.25}
									value={hangStrength}
									aria-label="Site-wide artwork hanging tilt"
									onChange={(event) =>
										setCreative({ hangStrength: Number(event.target.value) })
									}
								/>
							</label>
							{phoneControl('looseHang')}
						</>
					)}
					<small className="scope-summary">Pages inherit this setting. A page or individual image can override it without changing the rest of the site.</small>
					</div>
			</Field>
				</>
			)}

			{area === 'surface' && (
				<>
				<Field label="Living film texture">
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
						<div className="film-layer-control">
							<span>Layer</span>
							<div className="chip-row" role="group" aria-label="Living texture layer">
								<button
									type="button"
									className={`btn-icon btn-chip ${film.layer !== 'over' ? 'active' : ''}`}
									aria-pressed={film.layer !== 'over'}
									onClick={() => patchFilm({ layer: undefined })}
								>
									Under artwork
								</button>
								<button
									type="button"
									className={`btn-icon btn-chip ${film.layer === 'over' ? 'active' : ''}`}
									aria-pressed={film.layer === 'over'}
									onClick={() => patchFilm({ layer: 'over' })}
								>
									Over artwork
								</button>
							</div>
						</div>
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
				</>
			)}

			{area === 'motion' && (
				<>
				<Field label="Site motion">
				<div className="chip-row" role="group" aria-label="Site motion">
					{SITE_MOTION.map((level) => (
						<button
							key={level.value}
							type="button"
							className={`btn-icon btn-chip ${(doc.content.theme.motion?.intensity ?? 'off') === level.value ? 'active' : ''}`}
							onClick={() =>
								setTheme({
									// Only the dial moves. A template's choice of active
									// primitives survives turning motion off and back on.
									motion:
										level.value === 'off' && !doc.content.theme.motion
											? undefined
											: { ...doc.content.theme.motion, intensity: level.value },
								})
							}
						>
							{level.label}
						</button>
					))}
				</div>
				<small className="scope-summary">
					One motion feel for the whole site: sections rise into view, images hang in
					sequence, galleries respond on hover. Off keeps everything still — including
					page and section scenes. Visitors who prefer reduced motion see none of it.
				</small>
			</Field>

				{(doc.content.theme.motion?.intensity === 'subtle' ||
					doc.content.theme.motion?.intensity === 'full') && (
					<Field
						label="Scroll scene"
						hint="The scene every section plays as visitors scroll. Pages and sections can pick their own from their settings; Off in a section always wins."
					>
						<div className="scroll-scene-row">
							<select
								className="select-input"
								value={doc.content.theme.motion?.scene?.effect ?? ''}
								aria-label="Site-wide scroll scene"
								onChange={(event) =>
									setTheme({
										motion: {
											...doc.content.theme.motion,
											scene: nextSectionMotion(
												doc.content.theme.motion?.scene,
												event.target.value as SectionMotionEffect | '',
											),
										},
									})
								}
							>
								{SECTION_MOTION_CHOICES.map((choice) => (
									<option key={choice.value || 'inherit'} value={choice.value}>
										{choice.value === ''
											? 'House feel — sections rise into view'
											: choice.value === 'none'
												? 'Still — no scroll scenes'
												: choice.label}
									</option>
								))}
							</select>
							{doc.content.theme.motion?.scene &&
								doc.content.theme.motion.scene.effect !== 'none' && (
									<div className="scroll-scene-options">
										<label className="motion-range compact">
											<span>
												Strength <output>{doc.content.theme.motion.scene.intensity ?? 45}%</output>
											</span>
											<input
												type="range"
												min={1}
												max={100}
												step={1}
												value={doc.content.theme.motion.scene.intensity ?? 45}
												onChange={(event) =>
													setTheme({
														motion: {
															...doc.content.theme.motion,
															scene: {
																...doc.content.theme.motion!.scene!,
																intensity: Number(event.target.value),
															},
														},
													})
												}
											/>
										</label>
										<label className="compact-check">
											<input
												type="checkbox"
												checked={doc.content.theme.motion.scene.phone ?? false}
												onChange={(event) =>
													setTheme({
														motion: {
															...doc.content.theme.motion,
															scene: {
																...doc.content.theme.motion!.scene!,
																phone: event.target.checked || undefined,
															},
														},
													})
												}
											/>
											Use on phones
										</label>
									</div>
								)}
						</div>
					</Field>
				)}

				<Field label="Page transitions">
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
				</>
			)}

			{area === 'pointer' && (
				<>
				<Field label="Custom cursor">
				<div className="chip-row">
					<button
						type="button"
						className={`btn-icon btn-chip ${cursor === '' && !hasCursorImage ? 'active' : ''}`}
						onClick={() => {
							removeCursorImage();
							setCreative({ cursor: undefined });
						}}
					>
						Off
					</button>
					{CURSORS.map((c) => (
						<button
							key={c}
							type="button"
							className={`btn-icon btn-chip cursor-chip ${cursor === c && !hasCursorImage ? 'active' : ''}`}
							onClick={() => {
								removeCursorImage();
								setCreative({ cursor: c });
							}}
							aria-label={`Use ${c} as the cursor`}
						>
							{c}
						</button>
					))}
					<input
						className="text-input emoji-input"
						value={hasCursorImage || CURSORS.includes(cursor) ? '' : cursor}
						onChange={(e) => {
							removeCursorImage();
							setCreative({ cursor: [...e.target.value].slice(0, 2).join('') || undefined });
						}}
						placeholder="any emoji…"
						aria-label="Custom cursor emoji"
					/>
				</div>
				<div className={`cursor-upload ${hasCursorImage ? 'has-image' : ''}`}>
					{cursorImageUrl && <img src={cursorImageUrl} alt="" />}
					<div>
						<strong>{hasCursorImage ? doc.cursorImage.filename || 'Uploaded cursor' : 'Upload cursor art'}</strong>
						<small>PNG, WebP, GIF, or SVG works best with a transparent background.</small>
					</div>
					<ImageDrop
						ariaLabel={hasCursorImage ? 'Replace custom cursor image' : 'Upload a custom cursor image'}
						onFiles={(files) => {
							const file = files[0];
							if (file) setCursorImage(file);
						}}
					>
						<span>{hasCursorImage ? 'Replace' : 'Upload image'}</span>
					</ImageDrop>
					{hasCursorImage && (
						<button type="button" className="btn-ghost danger" onClick={removeCursorImage}>
							Remove
						</button>
					)}
				</div>
			</Field>

				<Field label="Cursor trail">
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
				</>
			)}

			{area === 'surface' && (
				<>
				<Field label="Paper grain">
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
			<HelpDisclosure label="About surface effects">
				<p>Surface effects sit behind or around the work. Page and image-level hanging choices can override the site-wide wall setting.</p>
			</HelpDisclosure>
				</>
			)}

			{area === 'pointer' && (
				<>
				<Field label="Tap to mark">
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
			<HelpDisclosure label="About pointer effects">
				<p>Pointer effects respond directly to a visitor’s mouse or touch. Each enabled effect can be turned off independently on phones.</p>
			</HelpDisclosure>
				</>
			)}

			{area === 'motion' && (
				<>
				<Field label="Slow reveal">
				<OnOff
					label="Slow reveal"
					value={creative.slowReveal ?? false}
					onChange={(value) => setCreative({ slowReveal: value || undefined })}
				/>
				{creative.slowReveal && phoneControl('slowReveal')}
			</Field>

				<Field label="Artwork wobble">
				<OnOff
					label="Artwork wobble"
					value={creative.artworkWobble ?? false}
					onChange={(value) => setCreative({ artworkWobble: value || undefined })}
				/>
				{creative.artworkWobble && phoneControl('artworkWobble')}
			</Field>

				<Field label="Color spin">
				<OnOff
					label="Color spin"
					value={creative.colorSpin ?? false}
					onChange={(value) => setCreative({ colorSpin: value || undefined })}
				/>
				{creative.colorSpin && phoneControl('colorSpin')}
			</Field>
			<HelpDisclosure label="About motion effects">
				<p>Movement applies across the published site. Keep one dominant motion style for a calmer result, then preview it on desktop and phone.</p>
			</HelpDisclosure>
				</>
			)}
			</div>
		</Section>
	);
}
