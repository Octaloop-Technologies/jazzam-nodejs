import mongoose, { Schema } from "mongoose";

const ServicesSchema = new Schema({
    label: String,
    sub_services: []
},{ timestamps: true });

export const Services = mongoose.model("service", ServicesSchema)