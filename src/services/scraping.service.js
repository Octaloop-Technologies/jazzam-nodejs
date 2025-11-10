import { ApiError } from "../utils/ApiError.js";
import { ApifyClient } from 'apify-client';

class ScrapingService {
  constructor() {
    this.client = new ApifyClient({
      token: process.env.APIFY_KEY,
    });
    this.baseUrl = "https://api.apify.com/v2";
  }

  // Generic method to handle Apify actor runs with SDK
  async runApifyActor(formType, actorId, url, proxyFormat = 'proxyConfiguration') {
    if (!process.env.APIFY_KEY) {
      throw new ApiError(500, "APIFY_TOKEN is not configured");
    }

    console.log("url****", url)
    try {
      console.log(`Starting Apify actor: ${actorId}`);

      // FIXED: Proper proxy configuration based on actor requirements
      let input;

      if (formType === 'twitter') {
        input = {
          "startUrls": [url],
          "addUserInfo": true,
          "customMapFunction": (object) => { return { ...object } },
          "proxy": {
            "useApifyProxy": true,
            "apifyProxyGroups": ["BUYPROXIES94952"],  // Add proxy groups
            "apifyProxyCountry": "US"             // Add country
          }
        };
      } else if (formType === 'facebook') {
        input = {
          "urls": [url],
          "proxyConfiguration": {
            "useApifyProxy": true,
            "apifyProxyGroups": ["BUYPROXIES94952"],  // Add proxy groups
            "apifyProxyCountry": "US"             // Add country
          }
        }
      } else if (formType === 'instagram') {
        const userName = url.split("/")[3];
        console.log("username**********", userName)
        input = {
          "includeAboutSection": false,
          "usernames": [
            userName
          ]
        }
      }else if(formType === 'linkedIn'){
        input = {
          profileUrls: [url]
        }
      }

      // if (proxyFormat === 'proxy') {
      //   // For actors that use "proxy" field (like epctex actors)
      //   input = {
      //     "startUrls": [url],
      //     "addUserInfo": true,
      //     "customMapFunction": (object) => { return {...object} },
      //     "proxy": {
      //       "useApifyProxy": true,
      //       "apifyProxyGroups": ["BUYPROXIES94952"],  // Add proxy groups
      //       "apifyProxyCountry": "US"             // Add country
      //     }
      //   };
      // } else {
      //   // For actors that use "proxyConfiguration" field
      //   input = {
      //     "startUrls": [url],
      //     "addUserInfo": true,
      //     "customMapFunction": (object) => { return {...object} },
      //     "proxyConfiguration": {
      //       "useApifyProxy": true,
      //       "apifyProxyGroups": ["RESIDENTIAL"],
      //       "apifyProxyCountry": "US"
      //     }
      //   };
      // }

      const run = await this.client.actor(actorId).call(input);

      console.log(`Actor run started! Run ID: ${run.id}`);
      console.log(`Status: ${run.status}`);
      console.log(`Monitor at: https://console.apify.com/actors/runs/${run.id}`);

      // Wait for the actor to finish
      const finishedRun = await this.client.run(run.id).waitForFinish();

      console.log(`Actor finished with status: ${finishedRun.status}`);

      if (finishedRun.status !== 'SUCCEEDED') {
        throw new ApiError(
          500,
          `${actorId} scraping failed with status: ${finishedRun.status}`
        );
      }

      // Get the results from the default dataset
      const { items } = await this.client.dataset(finishedRun.defaultDatasetId).listItems();

      console.log(`📦 Scraped ${items.length} items from ${actorId}`);

      return Array.isArray(items) && items.length > 0 ? items[0] : items;
    } catch (error) {
      console.error(`Error running ${actorId}:`, error.message);
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Scraping error: ${error.message}`);
    }
  }

  // LinkedIn Profile Scraping
  async scrapeLinkedInProfile(profileUrl) {
    const actorId = "dev_fusion~linkedin-profile-scraper";
    return await this.runApifyActor("linkedIn", actorId, profileUrl, 'proxyConfiguration');
  }

  // Meta/Facebook Profile Scraping
  async scrapeMetaProfile(username) {
    const actorId = "igolaizola/facebook-profile-scraper";
    return await this.runApifyActor("facebook", actorId, username, 'proxy');
  }

  // Twitter Profile Scraping - Using epctex/twitter-profile-scraper
  async scrapeTwitterProfile(username) {
    const actorId = "epctex/twitter-profile-scraper";
    return await this.runApifyActor("twitter", actorId, username, 'proxy');
  }

  // Instagram Profile Scraping
  async scrapeInstagramProfile(username) {
    const actorId = "apify/instagram-profile-scraper";
    return await this.runApifyActor("instagram", actorId, username, 'proxyConfiguration');
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
          profilePic:
            scrapedData.profilePic ||
            scrapedData.imgUrl ||
            scrapedData.photoUrl ||
            null,
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
          profilePic:
            scrapedData.profilePicUrl ||
            scrapedData.imgUrl ||
            scrapedData.photoUrl ||
            null,
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
          location: scrapedData.location || scrapedData.user?.location || null,
          country: scrapedData.country || null,
          city: scrapedData.city || null,
          profilePic:
            scrapedData.profilePicUrl ||
            scrapedData.imgUrl ||
            scrapedData.photoUrl ||
            scrapedData.user?.profile_image_url ||
            null,
          // Twitter-specific fields
          username: scrapedData.username || scrapedData.user?.screen_name || null,
          bio: scrapedData.bio || scrapedData.user?.description || null,
          followersCount: scrapedData.followersCount || scrapedData.user?.followers_count || null,
          followingCount: scrapedData.followingCount || scrapedData.user?.friends_count || null,
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
          profilePic:
            scrapedData.profilePicUrl ||
            scrapedData.imgUrl ||
            scrapedData.photoUrl ||
            null,
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
        actorId: "epctex/twitter-profile-scraper",
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

  // Advanced method: Run actor and stream results (for large datasets)
  async runApifyActorWithStreaming(actorId, input) {
    if (!process.env.APIFY_KEY) {
      throw new ApiError(500, "APIFY_KEY is not configured");
    }

    try {
      console.log(`Starting Apify actor with streaming: ${actorId}`);

      // Add proxy configuration to input
      const inputWithProxy = {
        ...input,
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL'],
          apifyProxyCountry: 'US',
        },
      };

      // Start the actor
      const run = await this.client.actor(actorId).start(inputWithProxy);

      console.log(`Actor started: ${run.id}`);

      // Monitor progress and stream partial results
      let isFinished = false;
      let lastItemCount = 0;

      while (!isFinished) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds

        const currentRun = await this.client.run(run.id).get();
        console.log(`Status: ${currentRun.status}`);

        // Get partial results
        const dataset = await this.client.dataset(currentRun.defaultDatasetId).listItems();
        const newItems = dataset.items.slice(lastItemCount);

        if (newItems.length > 0) {
          console.log(`New items scraped: ${newItems.length}`);
          // You can process newItems here for real-time updates
        }

        lastItemCount = dataset.items.length;

        if (['SUCCEEDED', 'FAILED', 'ABORTED'].includes(currentRun.status)) {
          isFinished = true;
        }
      }

      // Get final results
      const finalRun = await this.client.run(run.id).get();
      if (finalRun.status !== 'SUCCEEDED') {
        throw new ApiError(500, `Actor ${actorId} failed: ${finalRun.status}`);
      }

      const { items } = await this.client.dataset(finalRun.defaultDatasetId).listItems();
      console.log(`📦 Final result: ${items.length} items from ${actorId}`);

      return Array.isArray(items) && items.length > 0 ? items[0] : items;
    } catch (error) {
      console.error(`Streaming error for ${actorId}:`, error.message);
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Streaming scraping error: ${error.message}`);
    }
  }
}

export default new ScrapingService();