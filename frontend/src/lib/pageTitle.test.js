import { describe, it, expect } from "vitest";
import { documentTitle } from "./pageTitle";

describe("documentTitle", () => {
  it("titles static pages", () => {
    expect(documentTitle("/")).toBe("Dashboard · Vireon AI");
    expect(documentTitle("/render")).toBe("Render Queue · Vireon AI");
    expect(documentTitle("/editor/complete/")).toBe("Completed Videos · Vireon AI");
  });

  it("uses the registered record name on detail pages", () => {
    expect(documentTitle("/courses/cou-ABCD1234", "Linear Algebra")).toBe("Linear Algebra · Vireon AI");
    expect(documentTitle("/courses/cou-ABCD1234/curriculum", "Linear Algebra")).toBe("Linear Algebra · Curriculum · Vireon AI");
    expect(documentTitle("/courses/cou-ABCD1234/videos/vid-ABCD1234/studio", "Intro")).toBe("Intro · Studio · Vireon AI");
  });

  it("falls back to a generic label while a record is loading", () => {
    expect(documentTitle("/courses/cou-ABCD1234")).toBe("Course · Vireon AI");
    expect(documentTitle("/courses/cou-A/videos/vid-B")).toBe("Course Video · Vireon AI");
  });

  it("handles the v2 shell", () => {
    expect(documentTitle("/v2")).toBe("Overview · Vireon AI");
    expect(documentTitle("/v2/new")).toBe("New Video · Vireon AI");
    expect(documentTitle("/v2/jobs/job-ABCD1234")).toBe("Job Details · Vireon AI");
  });

  it("falls back to the app name for unknown routes", () => {
    expect(documentTitle("/nope")).toBe("Vireon AI");
  });
});
