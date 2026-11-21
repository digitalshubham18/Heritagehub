import { Schema, models, model, Model } from "mongoose";

/**
 * The heritage DIRECTORY: every UNESCO World Heritage Site and ASI protected monument we list, whether or not we sell
 * tickets for it. Deliberately NOT exported from models/index.ts: scripts/seed.ts wipes every model in that file, and
 * re-seeding the demo must never delete the imported directory.
 *
 * A site that has a bookable Destination points at it through `bookableSlug`. Directory-only sites have no prices,
 * hours or capacity (we don't invent them), so they can be found and read about but not booked.
 */
const ImageSchema = new Schema({
  url: { type: String, required: true },        // full-size, hotlinkable URL on upload.wikimedia.org
  thumbUrl: String,                               // ~800px rendition
  file: String,                                   // Commons file name, e.g. "File:Taj Mahal in March 2004.jpg"
  author: String,                                 // attribution text (plain text)
  license: String,                                // e.g. "CC BY-SA 4.0" or "Public domain"
  licenseUrl: String,
  sourceUrl: String,                              // Commons page where the licence can be checked
  width: Number, height: Number,
}, { _id: false });

const HeritageSchema = new Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  aliases: [String],                              // alternate spellings and old names, used by search
  searchKey: { type: String, index: true },       // normalised text built by buildSearchKey()
  categories: { type: [String], index: true },    // "unesco" and/or "asi"
  type: { type: String, enum: ["monument", "fort", "museum", "temple", "archaeological", "palace"], default: "monument", index: true },
  city: { type: String, default: "" },
  state: { type: String, default: "", index: true },
  summary: { type: String, default: "" },
  unesco: { id: String, year: Number, criteria: String, kind: String }, // id = UNESCO WHC number
  asiId: { type: String, index: true },           // e.g. N-TN-C1
  location: { lat: Number, lng: Number },
  wikipediaTitle: String,
  wikidataId: String,
  images: [ImageSchema],                          // ONLY verified, licensed photos. Empty means "no photo yet", never a guess.
  popularity: { type: Number, default: 0, index: true },
  bookableSlug: String,                           // slug of the matching Destination, if tickets are sold
  active: { type: Boolean, default: true, index: true },
  dataSource: String,                             // where the facts came from, for the audit trail
}, { timestamps: true });

export const HeritageSite: Model<any> = (models.HeritageSite as Model<any>) || model("HeritageSite", HeritageSchema);
