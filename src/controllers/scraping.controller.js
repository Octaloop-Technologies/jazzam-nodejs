import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const apiKey = process.env.APIFY_KEY;

const getLinkedinProfile = asyncHandler(async (req, res) => {
  const { linkedinProfileUrl } = req.body;
  if (!linkedinProfileUrl) {
    throw new ApiError(400, "Linkedin profile is required");
  }

  // Step 1: Start Actor
  const startResponse = await fetch(
    `https://api.apify.com/v2/acts/dev_fusion~linkedin-profile-scraper/runs?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileUrls: [linkedinProfileUrl],
      }),
    }
  );
  const startData = await startResponse.json();

  if (!startData.data || !startData.data.id) {
    throw new ApiError(500, "Failed to start Apify actor");
  }

  const runId = startData.data.id;

  // Step 2: Poll until run is finished
  let runStatus = "READY";
  let datasetId = null;

  while (["READY", "RUNNING"].includes(runStatus)) {
    const runResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
    );
    const runData = await runResponse.json();

    runStatus = runData.data.status;
    datasetId = runData.data.defaultDatasetId;

    if (["SUCCEEDED", "FAILED", "ABORTED"].includes(runStatus)) break;

    await new Promise((r) => setTimeout(r, 5000)); // wait 5 sec before checking again
  }

  if (runStatus !== "SUCCEEDED") {
    throw new ApiError(500, `Apify run ended with status: ${runStatus}`);
  }

  // Step 3: Fetch dataset items
  const datasetResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&format=json`
  );
  const results = await datasetResponse.json();

  // Step 4: Return final results
  return res
    .status(200)
    .json(
      new ApiResponse(200, results, "Linkedin profile fetched successfully")
    );
});

export { getLinkedinProfile };
