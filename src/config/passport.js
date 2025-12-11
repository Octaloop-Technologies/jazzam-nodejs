import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { Company } from "../models/company.model.js";

// check email regex for personal email
const isCorporateEmail = (email) => {
  const domain = email.split("@")[1].toLowerCase();
  const personalDomains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "icloud.com",
    "aol.com"
  ];

  return !personalDomains.includes(domain);
};


// JWT Strategy for protecting routes
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Only use header, remove cookie extractor
      secretOrKey: process.env.ACCESS_TOKEN_SECRET,
    },
    async (payload, done) => {
      try {
        const company = await Company.findById(payload._id).select(
          "-password -refreshToken"
        );
        if (company) {
          return done(null, company);
        }
        return done(null, false);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

// Google OAuth Strategy for Companies
passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Check if company already exists with this Google ID
        let company = await Company.findOne({ googleId: profile.id });

        console.log("accessToken:", accessToken);

        if (company) {
          return done(null, company);
        }

        const email = profile.emails[0].value;

        // check if try to signin using personal email
        if(!isCorporateEmail(email)){
          return done(null, false, { message: "Personal email addresses are not allowed. Use your company email." });
        }

        // Check if company exists with same email
        company = await Company.findOne({ email, provider: "local" });

        if (company) {
          // Link Google account to existing company
          company.googleId = profile.id;
          company.provider = "google";
          await company.save();
          return done(null, company);
        }

        // Create new company
        const newCompany = await Company.create({
          companyName: profile.emails[0].value.split("@")[0].toLowerCase(),
          email: profile.emails[0].value,
          googleId: profile.id,
          provider: "google",
          password: "google_oauth_company", // placeholder password
          isVerified: true,
          logo: {
            url: profile.photos[0]?.value || "https://via.placeholder.com/150",
            public_id: `google_${profile.id}`,
          },
        });

        return done(null, newCompany);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Serialize company for session
passport.serializeUser((company, done) => {
  done(null, { id: company._id, type: company.constructor.modelName });
});

// Deserialize company from session
passport.deserializeUser(async (data, done) => {
  try {
    let entity;
    if (data.type === "Company") {
      entity = await Company.findById(data.id).select(
        "-password -refreshToken"
      );
    }
    done(null, entity);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
