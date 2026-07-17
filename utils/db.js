import mongoose from 'mongoose/lib/index.js';

let isConnected = false;

export async function connectDB(env) {
  if (isConnected) {
    return;
  }
  
  const mongoUri = env.MONGO_URI || "mongodb://localhost:27017/ecommerce";
  
  try {
    await mongoose.connect(mongoUri);
    isConnected = true;
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    throw err;
  }
}
