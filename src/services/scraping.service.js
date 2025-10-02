import { ApiError } from "../utils/ApiError.js";

class ScrapingService {
  constructor() {
    this.apiKey = process.env.APIFY_KEY;
    this.baseUrl = "https://api.apify.com/v2";
  }

  // Generic method to handle Apify actor runs
  async runApifyActor(actorId, input) {
    if (!this.apiKey) {
      throw new ApiError(500, "Scraping service is not configured");
    }

    try {
      // Step 1: Start Actor
      const startResponse = await fetch(
        `${this.baseUrl}/acts/${actorId}/runs?token=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );

      if (!startResponse.ok) {
        throw new ApiError(500, `Failed to start ${actorId} scraping process`);
      }

      const startData = await startResponse.json();
      const runId = startData.data.id;

      // Step 2: Poll until run is finished
      let runStatus = "READY";
      let datasetId = null;

      while (["READY", "RUNNING"].includes(runStatus)) {
        const runResponse = await fetch(
          `${this.baseUrl}/actor-runs/${runId}?token=${this.apiKey}`
        );
        const runData = await runResponse.json();

        runStatus = runData.data.status;
        datasetId = runData.data.defaultDatasetId;

        if (["SUCCEEDED", "FAILED", "ABORTED"].includes(runStatus)) break;

        await new Promise((r) => setTimeout(r, 5000)); // wait 5 sec
      }

      if (runStatus !== "SUCCEEDED") {
        throw new ApiError(
          500,
          `${actorId} scraping failed with status: ${runStatus}`
        );
      }

      // Step 3: Fetch dataset items
      const datasetResponse = await fetch(
        `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiKey}&format=json`
      );

      if (!datasetResponse.ok) {
        throw new ApiError(500, `Failed to fetch ${actorId} data`);
      }

      const results = await datasetResponse.json();
      return Array.isArray(results) ? results[0] : results;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Scraping error: ${error.message}`);
    }
  }

  // LinkedIn Profile Scraping
  async scrapeLinkedInProfile(profileUrl) {
    const actorId = "dev_fusion~linkedin-profile-scraper";
    const input = {
      profileUrls: [profileUrl],
    };

    return await this.runApifyActor(actorId, input);
  }

  // Meta/Facebook Profile Scraping
  async scrapeMetaProfile(username) {
    const actorId = "dev_fusion~facebook-profile-scraper";
    const input = {
      usernames: [username],
    };

    return await this.runApifyActor(actorId, input);
  }

  // Twitter Profile Scraping
  async scrapeTwitterProfile(username) {
    const actorId = "dev_fusion~twitter-profile-scraper";
    const input = {
      usernames: [username],
    };

    return await this.runApifyActor(actorId, input);
  }

  // Instagram Profile Scraping
  async scrapeInstagramProfile(username) {
    const actorId = "dev_fusion~instagram-profile-scraper";
    const input = {
      usernames: [username],
    };

    return await this.runApifyActor(actorId, input);
  }

  // Generic platform scraping method
  async scrapeProfile(platform, identifier) {
    switch (platform) {
      case "linkedin":
        return await this.scrapeLinkedInProfile(identifier);
      case "meta":
        return await this.scrapeMetaProfile(identifier);
      case "twitter":
        return await this.scrapeTwitterProfile(identifier);
      case "instagram":
        return await this.scrapeInstagramProfile(identifier);
      default:
        throw new ApiError(400, `Unsupported platform: ${platform}`);
    }
  }

  // Extract standardized lead data from platform-specific scraped data
  extractLeadData(scrapedData, platform) {
    if (!scrapedData || typeof scrapedData !== "object") {
      return {};
    }

    switch (platform) {
      case "linkedin":
        return {
          firstName: scrapedData.firstName || null,
          lastName: scrapedData.lastName || null,
          fullName: scrapedData.fullName || null,
          email: scrapedData.email || null,
          phone: scrapedData.mobileNumber || null,
          company: scrapedData.companyName || null,
          companyIndustry: scrapedData.companyIndustry || null,
          companyWebsite: scrapedData.companyWebsite || null,
          companySize: scrapedData.companySize || null,
          jobTitle: scrapedData.jobTitle || null,
          department: scrapedData.department || null,
          location:
            scrapedData.addressWithCountry ||
            scrapedData.addressCountryOnly ||
            null,
          country: scrapedData.addressCountryOnly || null,
          city: scrapedData.addressWithoutCountry || null,
        };

      case "meta":
        return {
          firstName: scrapedData.firstName || null,
          lastName: scrapedData.lastName || null,
          fullName: scrapedData.fullName || null,
          email: scrapedData.email || null,
          phone: scrapedData.phone || null,
          company: scrapedData.company || null,
          companyIndustry: scrapedData.companyIndustry || null,
          companyWebsite: scrapedData.companyWebsite || null,
          companySize: scrapedData.companySize || null,
          jobTitle: scrapedData.jobTitle || null,
          department: scrapedData.department || null,
          location: scrapedData.location || null,
          country: scrapedData.country || null,
          city: scrapedData.city || null,
        };

      case "twitter":
        return {
          firstName: scrapedData.firstName || null,
          lastName: scrapedData.lastName || null,
          fullName: scrapedData.fullName || null,
          email: scrapedData.email || null,
          phone: scrapedData.phone || null,
          company: scrapedData.company || null,
          companyIndustry: scrapedData.companyIndustry || null,
          companyWebsite: scrapedData.companyWebsite || null,
          companySize: scrapedData.companySize || null,
          jobTitle: scrapedData.jobTitle || null,
          department: scrapedData.department || null,
          location: scrapedData.location || null,
          country: scrapedData.country || null,
          city: scrapedData.city || null,
        };

      case "instagram":
        return {
          firstName: scrapedData.firstName || null,
          lastName: scrapedData.lastName || null,
          fullName: scrapedData.fullName || null,
          email: scrapedData.email || null,
          phone: scrapedData.phone || null,
          company: scrapedData.company || null,
          companyIndustry: scrapedData.companyIndustry || null,
          companyWebsite: scrapedData.companyWebsite || null,
          companySize: scrapedData.companySize || null,
          jobTitle: scrapedData.jobTitle || null,
          department: scrapedData.department || null,
          location: scrapedData.location || null,
          country: scrapedData.country || null,
          city: scrapedData.city || null,
        };

      default:
        return {};
    }
  }

  // Validate platform-specific identifiers
  validatePlatformIdentifier(platform, identifier) {
    switch (platform) {
      case "linkedin":
        const linkedinRegex = /^https:\/\/www\.linkedin\.com\/in\/.+/;
        if (!linkedinRegex.test(identifier)) {
          throw new ApiError(400, "Invalid LinkedIn profile URL");
        }
        break;

      case "meta":
        const metaRegex = /^[a-zA-Z0-9._]+$/;
        if (!metaRegex.test(identifier)) {
          throw new ApiError(400, "Invalid Facebook username");
        }
        break;

      case "twitter":
        const twitterRegex = /^[a-zA-Z0-9_]+$/;
        if (!twitterRegex.test(identifier)) {
          throw new ApiError(400, "Invalid Twitter username");
        }
        break;

      case "instagram":
        const instagramRegex = /^[a-zA-Z0-9._]+$/;
        if (!instagramRegex.test(identifier)) {
          throw new ApiError(400, "Invalid Instagram username");
        }
        break;

      default:
        throw new ApiError(400, `Unsupported platform: ${platform}`);
    }
  }

  // Get available scraping platforms
  getAvailablePlatforms() {
    return [
      {
        platform: "linkedin",
        name: "LinkedIn",
        description: "Scrape LinkedIn profile data",
        identifierType: "URL",
        identifierExample: "https://www.linkedin.com/in/username",
        actorId: "dev_fusion~linkedin-profile-scraper",
      },
      {
        platform: "meta",
        name: "Meta/Facebook",
        description: "Scrape Facebook profile data",
        identifierType: "Username",
        identifierExample: "username",
        actorId: "dev_fusion~facebook-profile-scraper",
      },
      {
        platform: "twitter",
        name: "Twitter",
        description: "Scrape Twitter profile data",
        identifierType: "Username",
        identifierExample: "username",
        actorId: "dev_fusion~twitter-profile-scraper",
      },
      {
        platform: "instagram",
        name: "Instagram",
        description: "Scrape Instagram profile data",
        identifierType: "Username",
        identifierExample: "username",
        actorId: "dev_fusion~instagram-profile-scraper",
      },
    ];
  }
}

export default new ScrapingService();
