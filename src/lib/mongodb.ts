import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing from .env.local");
}

const client = new MongoClient(uri);

const globalForMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

export const mongoClientPromise =
  globalForMongo._mongoClientPromise ?? client.connect();

if (process.env.NODE_ENV !== "production") {
  globalForMongo._mongoClientPromise = mongoClientPromise;
}