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
 * The chrome is `ConfirmDialog`'s, deliberately: the same `fixed inset-0 z-70`
 * rendered in place rather than portalled (nothing in the admin content column
 * establishes a containing block — ConfirmDialog has proved that from inside
 * every manager), the same Tab-cycling focus trap, the same scroll lock, the same
 * restore of focus to the trigger on close, the same Motion transitions. A second
 * modal that animated or trapped focus differently would be a bug with no upside.
 *
 * `role="dialog"`, not `alertdialog`: this is a task, not a consequential
 * interruption.
 *
 * It knows nothing about files or uploads. It reports a crop rectangle in the
 * source image's pixel space plus a rotation, and the caller decides what that
 * becomes — which is what keeps it reusable for an official's portrait later.
 *
 * The split into two components is not decoration. Every piece of view state —
 * crop, zoom, rotation — has to be back at its default for the next photo, and
 * resetting it from an effect on `open` is a setState-in-effect cascade that the
 * React Compiler lint rule rejects. Putting that state inside the panel makes the
 * reset structural: the panel unmounts when the dialog closes and the next one
 * mounts fresh.
 */
export function ImageCropperDialog({ open, ...props }: ImageCropperDialogProps) {
  return (
    <MotionConfig reducedMotion="user">
      {/* The key belongs on AnimatePresence's direct child, not on the motion
          element inside it — that is what AnimatePresence tracks to know a child
          left. Exit animations still reach the nested motion elements through
          presence context. */}
      <AnimatePresence>{open ? <CropperPanel key="cropper" {...props} /> : null}</AnimatePresence>
    </MotionConfig>
  );
}

function CropperPanel({
  src,
  title = "Adjust your photo",
  confirmLabel = "Use photo",
  pending = false,
  onCancel,
  onConfirm,
}: Omit<ImageCropperDialogProps, "open">) {
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

  useEffect(() => {
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
  }, []);

  function turn(degrees: number) {
    // Kept in [0, 360) so repeated presses cannot wander off into 720 and hand
    // rotatedBoundingBox a number nobody reasoned about.
    setRotation((current) => (current + degrees + 360) % 360);
  }

  return (
    <motion.div className="fixed inset-0 z-70 flex items-center justify-center p-4">
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
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:shadow-raised"
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
  );
}
