import { describe, expect, it } from "vitest";
import {
  AVATARS_MEDIA_BUCKET,
  SITE_MEDIA_BUCKET,
  bucketForStatus,
  draftBucketFor,
  mediaUrl,
  mimeFromExtension,
  publicBucketFor,
  sniffMimeType,
  uploadRulesFor,
} from "@/lib/storage";

describe("publicBucketFor", () => {
  it("appends -media to the content kind", () => {
    expect(publicBucketFor("news")).toBe("news-media");
    expect(publicBucketFor("transparency")).toBe("transparency-media");
  });
});

describe("draftBucketFor", () => {
  it("appends -drafts to the content kind", () => {
    expect(draftBucketFor("officials")).toBe("officials-drafts");
  });
});

describe("bucketForStatus", () => {
  it("resolves to the public bucket only when published", () => {
    expect(bucketForStatus("events", "published")).toBe("events-media");
  });

  it("resolves to the drafts bucket for draft, in-review, and archived", () => {
    expect(bucketForStatus("events", "draft")).toBe("events-drafts");
    expect(bucketForStatus("events", "in-review")).toBe("events-drafts");
    expect(bucketForStatus("events", "archived")).toBe("events-drafts");
  });
});

describe("always-public buckets", () => {
  it("are fixed names with no status parameter", () => {
    expect(SITE_MEDIA_BUCKET).toBe("site-media");
    expect(AVATARS_MEDIA_BUCKET).toBe("avatars-media");
  });
});

describe("mediaUrl", () => {
  it("passes a full remote URL through unchanged", () => {
    expect(mediaUrl("news-media", "https://lh3.googleusercontent.com/foo.jpg")).toBe(
      "https://lh3.googleusercontent.com/foo.jpg",
    );
  });

  it("builds a public object URL for a bare path", () => {
    expect(mediaUrl("news-media", "news/abc-123/photo.jpg")).toContain(
      "/storage/v1/object/public/news-media/news/abc-123/photo.jpg",
    );
  });
});

describe("uploadRulesFor", () => {
  it("caps legislative uploads to exactly one PDF", () => {
    const rules = uploadRulesFor("legislative");
    expect(rules.mediaKind).toBe("legislative");
    expect(rules.maxFiles).toBe(1);
    expect(rules.allowedTypes).toEqual(["application/pdf"]);
  });

  it("caps transparency documents to MAX_FILES_PER_RECORD PDF-or-image files", () => {
    const rules = uploadRulesFor("documents");
    expect(rules.mediaKind).toBe("transparency");
    expect(rules.maxFiles).toBe(3);
    expect(rules.allowedTypes).toContain("image/png");
  });

  it("gives transparency projects the same rules as documents", () => {
    expect(uploadRulesFor("projects")).toEqual(uploadRulesFor("documents"));
  });
});

describe("sniffMimeType", () => {
  // Real leading bytes for each accepted type. Only the signature matters, so
  // the remainder is zero padding rather than a valid file body.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  it("recognises each of the four accepted types", () => {
    expect(sniffMimeType(png)).toBe("image/png");
    expect(sniffMimeType(jpeg)).toBe("image/jpeg");
    expect(sniffMimeType(webp)).toBe("image/webp");
    expect(sniffMimeType(pdf)).toBe("application/pdf");
  });

  it("returns null for an empty buffer", () => {
    expect(sniffMimeType(new Uint8Array([]))).toBeNull();
  });

  it("returns null for a buffer shorter than the signature it starts to match", () => {
    // The first three PNG bytes, then nothing — must not read past the end.
    expect(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it("rejects a RIFF container that is not WebP", () => {
    // "RIFF" then "AVI " — the offset-8 check is what separates them, and a
    // sniffer that only matched "RIFF" would call this an image/webp.
    const avi = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20,
    ]);
    expect(sniffMimeType(avi)).toBeNull();
  });

  it("returns null for a text file renamed to look like a PDF", () => {
    // The case the whole function exists for: `file.type` says application/pdf,
    // the bytes say "hello wor". The caller's !== comparison rejects it.
    const text = new TextEncoder().encode("hello world, not a pdf");
    expect(sniffMimeType(text)).toBeNull();
    expect(sniffMimeType(text)).not.toBe("application/pdf");
  });

  it("does not report a JPEG as any other accepted type", () => {
    // Guards the caller contract: a mismatch is detected by inequality, so a
    // sniffer returning the WRONG non-null type would silently pass nothing.
    expect(sniffMimeType(jpeg)).not.toBe("application/pdf");
    expect(sniffMimeType(jpeg)).not.toBe("image/png");
  });
});

describe("mimeFromExtension", () => {
  it("maps the four types this project stores", () => {
    expect(mimeFromExtension("news/abc/photo.png")).toBe("image/png");
    expect(mimeFromExtension("news/abc/photo.jpg")).toBe("image/jpeg");
    expect(mimeFromExtension("news/abc/photo.jpeg")).toBe("image/jpeg");
    expect(mimeFromExtension("news/abc/photo.webp")).toBe("image/webp");
    expect(mimeFromExtension("legislative/abc/ordinance.pdf")).toBe("application/pdf");
  });

  it("is case-insensitive", () => {
    expect(mimeFromExtension("officials/a/PORTRAIT.JPG")).toBe("image/jpeg");
    expect(mimeFromExtension("transparency/a/Report.PDF")).toBe("application/pdf");
  });

  it("returns null for anything else", () => {
    expect(mimeFromExtension("news/abc/notes.txt")).toBeNull();
    expect(mimeFromExtension("news/abc/noextension")).toBeNull();
    expect(mimeFromExtension("news/abc/trailing.")).toBeNull();
    expect(mimeFromExtension("")).toBeNull();
  });

  it("reads the extension, not a dot in a folder name", () => {
    expect(mimeFromExtension("news/v1.2/photo.png")).toBe("image/png");
    expect(mimeFromExtension("news/v1.2/photo")).toBeNull();
  });
});
