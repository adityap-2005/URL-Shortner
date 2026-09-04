import { createClient } from "redis";

const redisClient = createClient({
    url: "redis://localhost:6379"
});

redisClient.on("error", (err) => {
    console.error("Redis connection error:", err);
});

await redisClient.connect();

console.log("Connected to Redis");

export default redisClient;