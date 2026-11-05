import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing from .env.local");
}

type MongoCache = { clientPromise?: Promise<MongoClient> };
const globalForMongo = globalThis as typeof globalThis & { _omnilockMongo?: MongoCache };
const cache: MongoCache = process.env.NODE_ENV === "production"
  ? {}
  : (globalForMongo._omnilockMongo ??= {});

export function getMongoClient(): Promise<MongoClient> {
  if (cache.clientPromise) return cache.clientPromise;

  const client = new MongoClient(uri!, {
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
  });
  const pending = client.connect().catch(async (error) => {
    // A failed first connection must not poison every later Retry request.
    if (cache.clientPromise === pending) cache.clientPromise = undefined;
    await client.close().catch(() => {});
    throw error;
  });
  cache.clientPromise = pending;
  return pending;
}
