import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { ReviewStore } from "@/entities/memory/model/ReviewStore";
import { memorySource } from "@/test/api";
import { proposalDetail } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { ProposalDetailPage } from "./ProposalDetailPage";

function renderDetail(
  preview = proposalDetail({
    body: "Prefer FTS5 because it ships with SQLite.",
    bodyTruncated: true,
    bodyTokens: 9,
    maxTokens: 8,
  }),
): string {
  const review = new ReviewStore(memorySource());
  review.preview = preview;
  review.previewId = preview.id;
  review.previewProjectId = preview.projectId;
  return renderPage(
    <Routes>
      <Route
        path="/inbox/proposal/:project/:id"
        element={
          <ProposalDetailPage
            review={review}
            engine={new EngineStore()}
          />
        }
      />
    </Routes>,
    "en",
    ["/inbox/proposal/lv24/prop-1"],
  );
}

describe("ProposalDetailPage", () => {
  it("renders the bounded proposal body and its truncation notice", () => {
    const html = renderDetail();
    expect(html).toContain("Use SQLite FTS5");
    expect(html).toContain("Prefer FTS5 because it ships with SQLite.");
    expect(html).toContain("Body truncated at 9 of 8 tokens.");
    expect(html).toContain("read only");
    expect(html).toContain("Back to the queue");
  });

  it("renders a not-found state for an unknown route id", () => {
    const review = new ReviewStore(memorySource());
    const html = renderPage(
      <Routes>
        <Route
          path="/inbox/proposal/:project/:id"
          element={
            <ProposalDetailPage review={review} engine={new EngineStore()} />
          }
        />
      </Routes>,
      "en",
      ["/inbox/proposal/lv24/missing"],
    );
    expect(html).toContain("Proposal not found.");
  });
});
