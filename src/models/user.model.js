import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { securityConfig } from "../config/security.config.js";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    avatar: {
      url: {
        type: String, // OSS url
        required: true,
      },
      public_id: {
        type: String, // OSS object key for deletion
        required: true,
      },
    },
    coverImage: {
      url: {
        type: String, // OSS url
      },
      public_id: {
        type: String, // OSS object key for deletion
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    zohoCrmId: {
      type: String,
      unique: true,
      sparse: true,
    },
    provider: {
      type: String,
      enum: ["local", "google", "zohocrm"],
      default: "local",
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// check if password is correct
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// generate access and refresh token - Using centralized config
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    securityConfig.jwt.accessTokenSecret,
    {
      expiresIn: securityConfig.jwt.accessTokenExpiry,
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    securityConfig.jwt.refreshTokenSecret,
    {
      expiresIn: securityConfig.jwt.refreshTokenExpiry,
    }
  );
};

export const User = mongoose.model("User", userSchema);
