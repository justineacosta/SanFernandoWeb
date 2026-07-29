import { describe, expect, it } from "vitest";
import {
  AVATARS_MEDIA_BUCKET,
  SITE_MEDIA_BUCKET,
  bucketForStatus,
  draftBucketFor,
  mediaUrl,
  publicBucketFor,
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
