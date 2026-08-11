import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getTrainingResourceVideoEmbedUrl,
  splitTrainingResourceText
} from "../lib/trainingResources.ts";

describe("training resource helpers", () => {
  it("builds embed URLs for common training video links", () => {
    assert.equal(
      getTrainingResourceVideoEmbedUrl("https://youtu.be/abc123"),
      "https://www.youtube.com/embed/abc123"
    );
    assert.equal(
      getTrainingResourceVideoEmbedUrl("https://www.youtube.com/watch?v=abc123"),
      "https://www.youtube.com/embed/abc123"
    );
    assert.equal(
      getTrainingResourceVideoEmbedUrl("https://vimeo.com/123456"),
      "https://player.vimeo.com/video/123456"
    );
    assert.equal(
      getTrainingResourceVideoEmbedUrl("https://drive.google.com/file/d/file123/view"),
      "https://drive.google.com/file/d/file123/preview"
    );
  });

  it("splits field notes into clean line items", () => {
    assert.deepEqual(splitTrainingResourceText(" Head still \n\n Kick small \r\n Streamline "), [
      "Head still",
      "Kick small",
      "Streamline"
    ]);
  });
});
