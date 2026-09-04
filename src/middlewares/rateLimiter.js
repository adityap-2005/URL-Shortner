import redisClient from "../redis.js";

const rateLimiter = async (req, res, next) => {
    const ip = req.ip;
    const key = `rate-limit:${ip}`;
    const count = await redisClient.incr(key);
    if (count === 1) {
        await redisClient.expire(key, 60);
    }
    if (count > 10) {
        return res.status(429).json({
            error: "Too many requests, please try again later."
        });
    }
    next();
}

export default rateLimiter;