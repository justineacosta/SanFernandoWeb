# Interactive Avatar Cropper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Settings profile-photo drop-box with a clickable circle that opens a crop / zoom / rotate dialog, and normalise every avatar to a 512px WebP square.

**Architecture:** Three new units with one job each. `src/lib/crop-image.ts` does the canvas work and exposes two pure helpers for unit tests. `src/components/ui/image-cropper-dialog.tsx` is a generic modal wrapping `react-easy-crop`, copying `ConfirmDialog`'s focus-trap / scroll-lock / Escape mechanics. `src/features/admin/components/avatar-picker.tsx` is the clickable circle, owns the pending `File`, and drops into `account-profile-form.tsx` where `SingleImageUploader` is today. No Server Action, no query, and no schema change — the cropper's output is a `File`, which is exactly what the form already held.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, `react-easy-crop@^6.2.3`, `motion/react`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-avatar-cropper-design.md`

## Global Constraints

- Scope is the signed-in user's own avatar in `/admin/settings` **only**. Do not modify `src/features/admin/components/single-image-uploader.tsx` — it has four other consumers.
- `updateMyProfile` in `src/features/admin/actions/account.ts` must not change. Uploads still defer to Save; nothing may reach Supabase Storage before the user clicks **Save Profile**.
- Output is always **512×512 WebP, quality 0.9**, filename `avatar.webp`. Never upscale a crop smaller than 512px.
- `MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024` is a **client-side** ceiling for the picked source file. `MAX_IMAGE_BYTES` (2 MB) stays untouched and keeps guarding the server.
- Colours come only from the `brand-*` / `ink-*` / `danger*` tokens in `src/app/globals.css`. No blue.
- Motion values come from `src/lib/motion.ts` — never inline a duration or a spring. Every Motion surface wraps in `<MotionConfig reducedMotion="user">`.
- Path alias is `@/*` → `src/*`.
- `react-easy-crop` injects its own stylesheet on mount. Do **not** import a CSS file from it and do not add anything to `globals.css`.
- After every task: `npm run typecheck` and `npm run lint` must both pass clean.

---

### Task 1: Crop math and canvas export

**Files:**
- Modify: `package.json` (add `react-easy-crop`)
- Modify: `src/lib/storage.ts` (append two constants near `MAX_IMAGE_BYTES`)
- Create: `src/lib/crop-image.ts`
- Test: `tests/unit/crop-image.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_AVATAR_SOURCE_BYTES: number`, `AVATAR_OUTPUT_PX: number` from `@/lib/storage`
  - `rotatedBoundingBox(width: number, height: number, degrees: number): { width: number; height: number }`
  - `outputSizeFor(cropWidth: number, max?: number): number`
  - `decodeImageUrl(src: string): Promise<HTMLImageElement | null>`
  - `cropFromImage(image: HTMLImageElement, pixelCrop: PixelCrop, rotation: number): Promise<File | null>`
  - `interface PixelCrop { x: number; y: number; width: number; height: number }`

- [ ] **Step 1: Install the dependency**

```bash
npm install react-easy-crop@^6.2.3
```

Expected: `package.json` dependencies gain `"react-easy-crop": "^6.2.3"`. Peer range is `react >=16.4.0`, so React 19.2 is fine.

- [ ] **Step 2: Add the two constants to `src/lib/storage.ts`**

Insert directly after the `MAX_IMAGE_BYTES` line (line 4):

```ts
/**
 * Source ceiling for the avatar picker, enforced client-side only.
 *
 * Four times MAX_IMAGE_BYTES on purpose. The avatar cropper re-encodes the
 * chosen region to AVATAR_OUTPUT_PX before anything is uploaded, so the source
 * file and the uploaded file stopped being the same thing: a raw phone photo is
 * a legitimate input while what reaches the bucket is a ~50 KB WebP. The 2 MB
 * server check in uploadSingleImage still stands and still passes.
 */
export const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024; // 8 MB

/** Side of the square every avatar is normalised to, in pixels. */
export const AVATAR_OUTPUT_PX = 512;
```

- [ ] **Step 3: Write the failing test**

Create `tests/unit/crop-image.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { outputSizeFor, rotatedBoundingBox } from "@/lib/crop-image";

describe("rotatedBoundingBox", () => {
  it("leaves the box alone at 0 and 180 degrees", () => {
    for (const degrees of [0, 180]) {
      const box = rotatedBoundingBox(400, 300, degrees);
      expect(box.width).toBeCloseTo(400);
      expect(box.height).toBeCloseTo(300);
    }
  });

  it("swaps the sides at 90 and 270 degrees", () => {
    for (const degrees of [90, 270]) {
      const box = rotatedBoundingBox(400, 300, degrees);
      expect(box.width).toBeCloseTo(300);
      expect(box.height).toBeCloseTo(400);
    }
  });

  it("grows the box on a diagonal", () => {
    // A 45-degree turn needs more room than either side alone.
    const box = rotatedBoundingBox(400, 300, 45);
    expect(box.width).toBeGreaterThan(400);
    expect(box.height).toBeGreaterThan(400);
  });
});

describe("outputSizeFor", () => {
  it("clamps a large crop to the 512px output", () => {
    expect(outputSizeFor(3000)).toBe(512);
  });

  it("never enlarges a crop smaller than the output", () => {
    // Drawing a 300px region into a 512px canvas would upscale and blur it.
    expect(outputSizeFor(300)).toBe(300);
  });

  it("floors a fractional crop and never returns zero", () => {
    expect(outputSizeFor(300.9)).toBe(300);
    expect(outputSizeFor(0)).toBe(1);
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

```bash
npm run test:unit -- crop-image
```

Expected: FAIL — `Failed to resolve import "@/lib/crop-image"`.

- [ ] **Step 5: Create `src/lib/crop-image.ts`**

```ts
import { AVATAR_OUTPUT_PX } from "@/lib/storage";

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Canvas work for the avatar cropper, plus the two pure helpers it is built on.
 *
 * Browser-only in practice, but deliberately not marked `client-only`: the pure
 * exports below are unit-tested under Vitest, which has no DOM. Nothing here
 * touches `document` outside a function body, so importing the module in node is
 * safe.
 */

/** Bounding box of a `width`×`height` rectangle rotated `degrees` about its centre. */
export function rotatedBoundingBox(width: number, height: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
  };
}

/**
 * Side of the output square for a crop `cropWidth` source pixels wide. Clamped
 * to AVATAR_OUTPUT_PX and never larger than the crop itself — resampling a
 * 300px region up to 512px would only add blur.
 */
export function outputSizeFor(cropWidth: number, max = AVATAR_OUTPUT_PX): number {
  return Math.max(1, Math.min(max, Math.floor(cropWidth)));
}

/**
 * Decode an object URL into an image element, or null if the file is not a
 * usable image. Resolving null rather than throwing keeps the caller's error
 * path to a single branch — a corrupt JPEG and an unsupported codec have the
 * same remedy: pick another file.
 */
export function decodeImageUrl(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Draw `pixelCrop` out of an already-decoded image and hand back a square WebP
 * File, or null if the browser could not produce one.
 *
 * Two canvases, in this order, because that is the coordinate space
 * react-easy-crop reports in: `croppedAreaPixels` is measured against the
 * *rotated* image, so the whole image is rotated onto its bounding box first and
 * the crop rectangle is lifted out of that second. Cropping first and rotating
 * after would silently offset every non-zero rotation.
 */
export async function cropFromImage(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  rotation: number,
): Promise<File | null> {
  const { naturalWidth, naturalHeight } = image;
  const box = rotatedBoundingBox(naturalWidth, naturalHeight, rotation);

  const stage = document.createElement("canvas");
  stage.width = Math.round(box.width);
  stage.height = Math.round(box.height);
  const stageCtx = stage.getContext("2d");
  if (!stageCtx) return null;
  stageCtx.translate(stage.width / 2, stage.height / 2);
  stageCtx.rotate((rotation * Math.PI) / 180);
  stageCtx.drawImage(image, -naturalWidth / 2, -naturalHeight / 2);

  const size = outputSizeFor(pixelCrop.width);
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(
    stage,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    out.toBlob(resolve, "image/webp", 0.9);
  });
  if (!blob) return null;
  return new File([blob], "avatar.webp", { type: "image/webp" });
}
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm run test:unit -- crop-image
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add package.json package-lock.json src/lib/storage.ts src/lib/crop-image.ts tests/unit/crop-image.test.ts
git commit -m "feat(avatars): crop math and canvas export"
```

---

### Task 2: The cropper dialog primitive

**Files:**
- Create: `src/components/ui/image-cropper-dialog.tsx`

**Interfaces:**
- Consumes: `PixelCrop` from `@/lib/crop-image`; `FADE_QUICK`, `POP` from `@/lib/motion`; `Button` from `@/components/ui/button`.
- Produces: `ImageCropperDialog` with props `{ open: boolean; src: string; title?: string; confirmLabel?: string; pending?: boolean; onCancel: () => void; onConfirm: (crop: PixelCrop, rotation: number) => void }`.

The dialog is **generic and stateless about files** — it never sees a `File`, never uploads, and never revokes the URL it is handed. It reports a crop rectangle and a rotation, and the caller turns that into a file. That boundary is what keeps it reusable for the officials portrait later.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PixelCrop } from "@/lib/crop-image";
import { FADE_QUICK, POP } from "@/lib/motion";

interface ImageCropperDialogProps {
  open: boolean;
  /** Object URL of the image being edited. The CALLER owns and revokes it. */
  src: string;
  title?: string;
  confirmLabel?: string;
  /** True while the caller is turning the crop into a file. */
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (crop: PixelCrop, rotation: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Crop, zoom and rotate one image inside a modal.
 *
 * The chrome is `ConfirmDialog`'s, deliberately: same `fixed inset-0 z-70`
 * rendered in place rather than portalled (nothing in the admin content column
 * establishes a containing block — ConfirmDialog has proved that from inside
 * every manager), same Tab-cycling focus trap, same scroll lock, same restore of
 * focus to the trigger on close, same Motion transitions. A second modal that
 * animated or trapped focus differently would be a bug with no upside.
 *
 * `role="dialog"`, not `alertdialog`: this is a task, not a consequential
 * interruption.
 *
 * It knows nothing about files or uploads. It reports a crop rectangle in the
 * source image's pixel space plus a rotation, and the caller decides what that
 * becomes.
 */
export function ImageCropperDialog({
  open,
  src,
  title = "Adjust your photo",
  confirmLabel = "Use photo",
  pending = false,
  onCancel,
  onConfirm,
}: ImageCropperDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLInputElement>(null);
  const onCancelRef = useRef(onCancel);
  const pendingRef = useRef(pending);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [rotation, setRotation] = useState(0);
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null);

  useEffect(() => {
    onCancelRef.current = onCancel;
    pendingRef.current = pending;
  });

  // A fresh image gets a fresh view. The dialog stays mounted between opens
  // (AnimatePresence needs it to, for the exit animation), so without this the
  // second photo would inherit the first one's zoom and rotation.
  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
    setRotation(0);
    setPixelCrop(null);
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus starts on the zoom slider: it is the first control, and unlike
    // ConfirmDialog there is no destructive button for a stray Enter to fire.
    zoomRef.current?.focus();
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!pendingRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  function turn(degrees: number) {
    // Keep it in [0, 360) so the slider-free rotate buttons cannot wander off
    // into 720 and confuse the bounding-box maths.
    setRotation((current) => (current + degrees + 360) % 360);
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="cropper"
            className="fixed inset-0 z-70 flex items-center justify-center p-4"
          >
            <motion.div
              aria-hidden="true"
              onClick={() => (pending ? undefined : onCancel())}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_QUICK}
              className="absolute inset-0 bg-ink-950/60"
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="image-cropper-title"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={POP}
              className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-floating"
            >
              <h2
                id="image-cropper-title"
                className="font-display text-lg font-semibold tracking-tight text-ink-900"
              >
                {title}
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                Drag to reposition. Use the slider to zoom, or the arrow keys to nudge.
              </p>

              <div className="relative mt-4 h-64 overflow-hidden rounded-2xl bg-ink-950">
                <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  minZoom={MIN_ZOOM}
                  maxZoom={MAX_ZOOM}
                  roundCropAreaPixels
                  keyboardStep={10}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area: Area, pixels: Area) => setPixelCrop(pixels)}
                />
              </div>

              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="image-cropper-zoom"
                    className="text-xs font-semibold uppercase tracking-wider text-ink-500"
                  >
                    Zoom
                  </label>
                  <input
                    ref={zoomRef}
                    id="image-cropper-zoom"
                    type="range"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-200 accent-brand-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:shadow-raised [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand-500"
                  />
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-9 px-0"
                      onClick={() => turn(-90)}
                      aria-label="Rotate left"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-9 px-0"
                      onClick={() => turn(90)}
                      aria-label="Rotate right"
                    >
                      <RotateCw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" size="sm" disabled={pending} onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={pending || !pixelCrop}
                    onClick={() => pixelCrop && onConfirm(pixelCrop, rotation)}
                  >
                    {pending ? "Working…" : confirmLabel}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: clean. If `Cropper`'s named `Area` type does not resolve, check the export list in `node_modules/react-easy-crop/index.d.ts` — v6 exports `Area` as a named type alongside `Cropper as default`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/image-cropper-dialog.tsx
git commit -m "feat(ui): image cropper dialog"
```

---

### Task 3: The clickable circle, wired into Settings

**Files:**
- Create: `src/features/admin/components/avatar-picker.tsx`
- Modify: `src/features/admin/components/account-profile-form.tsx:44-60` (the Photo column) and its imports

**Interfaces:**
- Consumes: `ImageCropperDialog`; `cropFromImage`, `decodeImageUrl`, `PixelCrop` from `@/lib/crop-image`; `ALLOWED_IMAGE_TYPES`, `MAX_AVATAR_SOURCE_BYTES`, `photoUrl` from `@/lib/storage`.
- Produces: `AvatarPicker` with props `{ existingSrc: string | null; file: File | null; onFileChange: (file: File | null) => void; removeExisting: boolean; onRemoveExistingChange: (remove: boolean) => void }`.

There is no `fullName` prop. `Avatar` takes one because it falls back to initials; this component's empty state is an upload icon, not initials (spec §2), so a name here would be an unused prop.

The prop names mirror `SingleImageUploader`'s deliberately, so `account-profile-form.tsx` keeps the same state it has today and the diff there is a swap, not a rewrite.

- [ ] **Step 1: Create `src/features/admin/components/avatar-picker.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { UploadCloud } from "lucide-react";
import { ImageCropperDialog } from "@/components/ui/image-cropper-dialog";
import { cropFromImage, decodeImageUrl, type PixelCrop } from "@/lib/crop-image";
import { ALLOWED_IMAGE_TYPES, MAX_AVATAR_SOURCE_BYTES, photoUrl } from "@/lib/storage";

interface AvatarPickerProps {
  /** Storage path already on the profile, or null. */
  existingSrc: string | null;
  /** The cropped, not-yet-uploaded file, or null. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** True once the user has asked to drop the stored photo; applies on save. */
  removeExisting: boolean;
  onRemoveExistingChange: (remove: boolean) => void;
}

/**
 * The profile photo as a control: click the circle, crop what you picked, save.
 *
 * Not a variant of SingleImageUploader. That component is a rectangle-first
 * drop-box with alt text and four other consumers, and the two share nothing but
 * the words "pick a file" — folding a cropper, a circular hover state and an
 * 8 MB source ceiling into it would have made every announcement and event cover
 * pay for the avatar's requirements.
 *
 * Like every uploader in this codebase it makes NO network calls. The crop
 * becomes a File in the parent's state and reaches storage only when
 * updateMyProfile runs on Save, so a cancelled crop cannot orphan an object.
 */
export function AvatarPicker({
  existingSrc,
  file,
  onFileChange,
  removeExisting,
  onRemoveExistingChange,
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // The cropped result's preview URL. Owned here, revoked on replace, on unmount,
  // and when the parent resets `file` to null after a successful save — the
  // Settings card is a long-lived mount that never unmounts, so an unmount-only
  // cleanup would leak one object URL per save.
  const previewRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // The source being edited: its object URL for the dialog, and the decoded
  // element the canvas draws from. Kept in a ref because nothing renders it.
  const sourceUrlRef = useRef<string | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  useEffect(() => {
    if (!file && previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
      setPreview(null);
    }
  }, [file]);

  function closeCropper() {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = null;
    sourceImageRef.current = null;
    setSourceUrl(null);
  }

  async function pick(candidate: File | undefined) {
    if (!candidate) return;
    setError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(candidate.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      setError("Images must be JPG, PNG, or WebP.");
      return;
    }
    if (candidate.size > MAX_AVATAR_SOURCE_BYTES) {
      setError("The image must be 8 MB or smaller.");
      return;
    }

    const url = URL.createObjectURL(candidate);
    const image = await decodeImageUrl(url);
    if (!image) {
      URL.revokeObjectURL(url);
      setError("That image could not be opened. Try another file.");
      return;
    }
    sourceUrlRef.current = url;
    sourceImageRef.current = image;
    setSourceUrl(url);
  }

  async function applyCrop(pixelCrop: PixelCrop, rotation: number) {
    const image = sourceImageRef.current;
    if (!image) return;
    setCropping(true);
    const cropped = await cropFromImage(image, pixelCrop, rotation);
    setCropping(false);
    if (!cropped) {
      closeCropper();
      setError("That image could not be opened. Try another file.");
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(cropped);
    setPreview(previewRef.current);
    onFileChange(cropped);
    // Picking a new photo means keeping one, whatever the pending remove flag said.
    onRemoveExistingChange(false);
    closeCropper();
  }

  const storedUrl = existingSrc && !removeExisting ? photoUrl(existingSrc) : null;
  const shown = preview ?? storedUrl;
  const hasSomethingToRemove = Boolean(file) || (Boolean(existingSrc) && !removeExisting);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void pick(event.dataTransfer.files[0]);
        }}
        aria-label={shown ? "Change profile photo" : "Add profile photo"}
        className="group relative block h-32 w-32 shrink-0 overflow-hidden rounded-full ring-2 ring-brand-400/40 transition-shadow duration-(--duration-quick) hover:ring-brand-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
      >
        {shown ? (
          preview ? (
            // A blob: URL — next/image cannot fetch or optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <Image src={shown} alt="" fill sizes="128px" className="object-cover" />
          )
        ) : (
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-linear-to-br from-brand-400 to-brand-600"
          >
            <UploadCloud className="h-9 w-9 text-white" />
          </span>
        )}

        {/* The hover/focus affordance. Only over a photo — the empty state already
            shows the upload icon, so a scrim there would just dim it. */}
        {shown ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-ink-950/45 opacity-0 transition-opacity duration-(--duration-quick) group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <UploadCloud className="h-8 w-8 text-white" />
          </span>
        ) : null}
      </button>

      <div className="space-y-1">
        <p className="text-xs text-ink-500">
          {file
            ? "Uploads when you save."
            : removeExisting && existingSrc
              ? "The photo will be removed when you save."
              : "Click the circle to upload. JPG, PNG or WebP, up to 8 MB."}
        </p>
        {hasSomethingToRemove ? (
          <button
            type="button"
            onClick={() => {
              onFileChange(null);
              if (existingSrc) onRemoveExistingChange(true);
            }}
            className="text-xs font-medium text-danger hover:underline"
          >
            Remove photo
          </button>
        ) : null}
        {removeExisting && existingSrc && !file ? (
          <button
            type="button"
            onClick={() => onRemoveExistingChange(false)}
            className="block text-xs font-medium text-ink-700 hover:underline"
          >
            Keep it
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}

      <ImageCropperDialog
        open={Boolean(sourceUrl)}
        src={sourceUrl ?? ""}
        pending={cropping}
        onCancel={closeCropper}
        onConfirm={(pixelCrop, rotation) => void applyCrop(pixelCrop, rotation)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `account-profile-form.tsx`**

Replace the `SingleImageUploader` import:

```ts
import { AvatarPicker } from "./avatar-picker";
```

`photoUrl` is no longer needed in this file (the picker resolves the stored path
itself), so drop `import { photoUrl } from "@/lib/storage";`.

Replace the Photo column body (the `<SingleImageUploader ... />` element) with:

```tsx
<AvatarPicker
  existingSrc={currentUser.avatarSrc}
  file={avatarFile}
  onFileChange={setAvatarFile}
  removeExisting={removeAvatar}
  onRemoveExistingChange={setRemoveAvatar}
/>
```

Everything else in the file — `avatarFile` / `removeAvatar` state, the `FormData`
assembly in `submit`, the reset after a successful save — stays exactly as it is.

- [ ] **Step 3: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: clean. An "unused import" error for `photoUrl` or `SingleImageUploader`
means Step 2 missed one.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/components/avatar-picker.tsx src/features/admin/components/account-profile-form.tsx
git commit -m "feat(settings): click your photo to crop it"
```

---

### Task 4: Verify and document

**Files:**
- Modify: `CLAUDE.md` (one bullet in "Conventions and gotchas")

- [ ] **Step 1: Full verification sweep**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
```

Expected: all four clean. The build is the one that catches a `"use client"`
boundary mistake — `react-easy-crop` is a class component and must never end up in
a Server Component's tree.

- [ ] **Step 2: Add the CLAUDE.md bullet**

Under "Conventions and gotchas", after the placeholder-reality bullet:

```markdown
- **The avatar is the one uploader with a cropper**, and it is not a
  `SingleImageUploader` variant. `AvatarPicker` (Settings → Profile) is a clickable
  circle that opens `ImageCropperDialog` (`react-easy-crop`) and normalises the
  result to a 512px WebP square, which is why its *source* ceiling is
  `MAX_AVATAR_SOURCE_BYTES` (8 MB) and not `MAX_IMAGE_BYTES` (2 MB) — the server's
  2 MB check still guards the upload, and the ~50 KB crop passes it easily. The
  dialog copies `ConfirmDialog`'s focus-trap / scroll-lock / Escape mechanics on
  purpose; don't give it its own. `react-easy-crop` injects its own stylesheet, so
  there is nothing to import into `globals.css`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): the avatar cropper"
```

- [ ] **Step 4: Hand the manual checks to the user**

The canvas path cannot run under Vitest and driving a pointer-drag cropper through
Playwright is a poor return, so these are browser checks:

1. `/admin/settings` with no photo — amber circle + cloud icon; Tab reaches it and
   Enter opens the file dialog.
2. Pick a sideways phone photo → rotate right → zoom → drag → `Use photo` → the
   circle shows the crop → `Save Profile` → the top-bar avatar updates.
3. Cancel in the dialog → nothing pending, circle unchanged, no upload.
4. `Remove photo` → `Save Profile` → the circle falls back to initials in both the
   settings card and the top bar.
5. Drop an image file onto the circle → the dialog opens.
6. On a phone: pinch-zoom and drag work inside the dialog and the page behind does
   not scroll.
7. Pick a >8 MB image → "The image must be 8 MB or smaller.", no dialog.
