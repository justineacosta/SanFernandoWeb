# Interactive Avatar Cropper

**Date:** 2026-07-25
**Status:** Approved, ready for planning
**Migration:** none — schema unchanged
**New dependency:** `react-easy-crop@^6.2.3`

## 1. What this is

The 2026-07-24 sub-project gave staff a profile picture and explicitly left
*"cropping/resizing UI"* out of scope. This is that follow-up, and nothing else.

Two complaints with today's picker, both UX:

1. **The upload target is a box, not the face.** The Settings photo column shows a
   96px circle with `Replace` / `Remove` text links beside it, and a dashed
   drag-and-drop rectangle when no photo is set. The thing you want to change is
   the circle, so the circle should be what you click.
2. **Whatever you pick is what you get.** A phone photo goes up sideways, at
   4000px, framed for a rectangle, and `object-cover` crops it wherever it likes.
   There is no way to choose the framing.

Scope is the **signed-in user's own avatar in `/admin/settings`**. Officials'
portraits, announcement images, event covers and the Home/About CMS images keep
`SingleImageUploader` and its dashed drop-box unchanged — that component has four
other consumers and this design does not touch it. Also out of scope: re-cropping a
photo already saved (you re-pick the file), flipping, filters, and any change to
the public site, which has no accounts.

## 2. The interaction

One circle, always, and it is a `<button type="button">`.

| State | Renders |
| --- | --- |
| No photo | Amber gradient circle (`from-brand-400 to-brand-600`, same as `Avatar`'s initials fill) with a white cloud-upload icon centred |
| Photo set | The photo, `object-cover`, `ring-2 ring-brand-400/40` — matching `Avatar` |
| Hover / keyboard focus, photo set | An `ink-950/45` scrim with the upload icon fades in over the photo |
| A crop is pending save | The cropped result, plus the caption *"Uploads when you save."* |

Under the circle: a `JPG, PNG or WebP` hint, and a `Remove photo` danger link that
appears only when there is a stored photo or a pending crop.

Clicking the circle opens the OS file dialog directly — no intermediate menu. The
common case is replacing, and a menu would put a click in front of it. Dropping a
file onto the circle works too; it costs two handlers and the old drop-box had it.

The empty state deliberately does **not** show the user's initials, even though
that is what `Avatar` does everywhere else. In every other call site the avatar is
a read-only identity marker sitting next to the person's name; here it is a
control, and an empty control should say what it does. The upload icon is the
affordance.

## 3. The cropper dialog

New shared primitive: `src/components/ui/image-cropper-dialog.tsx`.

It is modelled on `ConfirmDialog` and copies its mechanics rather than inventing
new ones — `fixed inset-0 z-70` rendered in place (no portal: `ConfirmDialog` proves
nothing in the admin content column establishes a containing block), body scroll
locked while open, focus trapped by the same Tab-cycling `keydown` listener, focus
restored to the trigger on close, Escape cancels, backdrop click cancels. Motion
comes from `AnimatePresence` + `FADE_QUICK` / `POP` inside
`<MotionConfig reducedMotion="user">`, exactly as `ConfirmDialog` does — this is the
established treatment for a modal in this codebase, and hand-rolling a CSS variant
would leave two dialogs animating differently.

`role="dialog"`, not `alertdialog`: this is a task, not a consequential
interruption.

Inside the panel:

- **A square crop stage** with a **circular mask** over it. A round preview of a
  round avatar is the whole point — a square viewport would hide precisely the
  corners `border-radius: 50%` is about to eat. `react-easy-crop` handles this with
  `cropShape="round"`, `aspect={1}`, `showGrid={false}`. The library injects its own
  stylesheet on mount, so there is no CSS file to import and nothing to add to
  `globals.css`.
- **A zoom slider**, 1× → 3×, wired to the library's `zoom` prop. Scroll wheel and
  pinch also drive it; the slider exists because a trackpad user with no pinch
  gesture and a keyboard user both need a way in. It is the project's first
  `input[type="range"]`, so its thumb/track styling lives in this file as
  `[&::-webkit-slider-thumb]:…` utilities — a local detail, not a new primitive,
  until a second slider exists.
- **Rotate left / rotate right buttons**, quarter turns, wired to `rotation`.
  Quarter turns rather than a free-angle slider because the problem being solved is
  a sideways phone photo, and free rotation adds a control that is fiddly on a
  touch screen for a case (straightening a tilted shot) nobody has asked for.
- **`Cancel` / `Use photo`.** Initial focus lands on the zoom slider: it is the
  first control, and unlike `ConfirmDialog` there is no destructive button for a
  stray Enter to trigger.

Cancel discards everything — no state change in the parent, no network call, and
the source object URL is revoked. `Use photo` produces a `File` and closes.

## 4. Data flow

The existing contract is untouched. The cropper's output is a `File`, and a `File`
is exactly what the picker produced before.

```
click circle
  → <input type="file"> (source validated: type + MAX_AVATAR_SOURCE_BYTES)
  → ImageCropperDialog, editing an object URL of the source File
  → "Use photo" → canvas → toBlob → new File(...)
  → AvatarPicker state (the same `avatarFile` the form already holds)
  → "Save Profile" → updateMyProfile(input, avatarForm)   [UNCHANGED]
```

`updateMyProfile`, `uploadSingleImage("avatars", …)`, the compensating delete, the
deferred delete of the replaced object, and the audit entry all stay as they are.
Nothing reaches storage until Save, so a cancelled crop cannot orphan an object —
the sub-project 7 invariant holds by construction, as before.

### 4.1 Object URLs

Two of them, owned separately, because they have different lifetimes:

- **The source URL** belongs to the dialog and is revoked when the dialog closes,
  either way. It must not be revoked before `Use photo` finishes reading the
  image.
- **The preview URL** for the cropped result belongs to `AvatarPicker`, and is
  revoked when it is replaced, when the component unmounts, and — the trap
  commit `979b06d` fixed in `SingleImageUploader` — when the parent resets the file
  to `null` after a successful save. The Settings card is a long-lived mount that
  never unmounts, so an unmount-only cleanup leaks one URL per save.

## 5. Output normalisation

Every avatar leaves the browser as **512×512 WebP at quality 0.9** (~40–60 KB),
named `avatar.webp`, regardless of what was picked. WebP is already in
`ALLOWED_IMAGE_TYPES`, so the server needs no change.

Output side is `min(512, floor(cropWidth))`: if someone crops a 300px region out of
a small image, drawing it into a 512px canvas would upscale and blur. Never
enlarge.

### 5.1 The source limit rises to 8 MB

`MAX_IMAGE_BYTES` is 2 MB, which rejects most modern phone photos before the user
gets to crop anything. Since what now reaches the server is the 512px re-encode,
the *source* ceiling and the *upload* ceiling stopped being the same number:

- New `MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024` in `src/lib/storage.ts`, checked
  client-side when the file is picked, for the avatar only.
- `MAX_IMAGE_BYTES` is unchanged and `uploadSingleImage` still enforces it
  server-side. The 512px WebP passes it by two orders of magnitude, and the check
  stays because a Server Action is a public endpoint — the client's 8 MB is a
  courtesy, not a guarantee.

The cost is decoding up to 8 MB in a canvas on a low-end phone. Acceptable: it is
one image, on an admin-only page, and the alternative is telling a barangay staff
member their own photo is too big.

## 6. Files

| File | Change |
| --- | --- |
| `package.json` | + `react-easy-crop@^6.2.3` |
| `src/lib/storage.ts` | + `MAX_AVATAR_SOURCE_BYTES`, + `AVATAR_OUTPUT_PX` |
| `src/lib/crop-image.ts` | **new** — `rotatedBoundingBox` + `outputSizeFor` (pure, unit-tested) and `cropToFile` (canvas, browser-only) |
| `src/components/ui/image-cropper-dialog.tsx` | **new** — the modal |
| `src/features/admin/components/avatar-picker.tsx` | **new** — the clickable circle, owns the pending `File` |
| `src/features/admin/components/account-profile-form.tsx` | swap `SingleImageUploader` → `AvatarPicker` |
| `tests/unit/crop-image.test.ts` | **new** |

`src/features/admin/components/single-image-uploader.tsx` is deliberately absent
from that table: it keeps all four of its other consumers, unmodified. Its
`previewShape="circle"` option loses its only user and stays anyway — the officials
portrait is the obvious next consumer if this ever widens.

`crop-image.ts` holds both the pure helpers and the canvas work in one module. The
canvas function touches `document` only inside its body, so Vitest can import the
pure exports from the same file without a DOM.

## 7. Accessibility

- The circle is a real `<button>` with `aria-label="Change profile photo"` (or
  `"Add profile photo"` when empty). The hover scrim is `aria-hidden`; keyboard
  focus shows it too, so focus is never invisible.
- The dialog is `role="dialog" aria-modal="true"` with `aria-labelledby` on its
  heading, focus trapped and restored, Escape to cancel.
- The zoom slider is a native range input with a visible label, so it is
  keyboard-operable and announced with its value.
- The crop area pans with the arrow keys once focused — `react-easy-crop` supports
  this natively, and `keyboardStep` is raised from its default of 1px to 10 so a
  keyboard user is not holding an arrow key for a hundred presses. Combined with
  the slider and the rotate buttons being real controls rather than gestures, the
  whole dialog is operable without a pointer.
- Errors (wrong type, too large, decode failure) render in a `role="alert"`
  paragraph under the circle, matching `SingleImageUploader`.

## 8. Error handling

| Case | Behaviour |
| --- | --- |
| Not JPG/PNG/WebP | Picker rejects, `role="alert"`: "Images must be JPG, PNG, or WebP." Dialog never opens. |
| Over 8 MB | Picker rejects: "The image must be 8 MB or smaller." |
| Image fails to decode (corrupt file) | Dialog closes, `role="alert"`: "That image could not be opened. Try another file." |
| `toBlob` returns null | Same treatment — a browser-level failure, surfaced not swallowed. |
| Save fails server-side | Unchanged: `updateMyProfile` returns `{ error }`, the pending crop is kept so the user can retry. |

## 9. Testing

`tests/unit/crop-image.test.ts` covers the pure math: `rotatedBoundingBox` for 0 /
90 / 180 / 270 on a non-square image (90 and 270 swap the sides; 0 and 180 do not),
and `outputSizeFor` clamping to 512 while never enlarging a smaller crop.

Everything else is a browser check — the canvas path cannot run under Vitest, and
per CLAUDE.md component-level tests are deliberately not a thing here. No
Playwright: driving a pointer-drag cropper through a real browser session is a poor
return for the time it takes. The manual checklist:

1. `/admin/settings` with no photo — amber circle + cloud icon; Tab reaches it,
   Enter opens the picker.
2. Pick a sideways phone photo → rotate right → zoom → drag → `Use photo` → the
   circle shows the crop → `Save Profile` → the top-bar avatar updates.
3. Cancel in the dialog → nothing pending, circle unchanged.
4. `Remove photo` → `Save Profile` → circle falls back to initials in both the
   settings card and the top bar.
5. Drop a file onto the circle → the dialog opens.
6. On a phone: pinch-zoom and drag work inside the dialog, and the page behind
   does not scroll.
