import express from "express";
const app = express();
import { customAlphabet } from "nanoid";
import redisClient from "./redis.js";
import analyticsQueue from "./queues/analyticsQueue.js";
import "./workers/analyticsWorker.js";
import rateLimiter from "./middlewares/rateLimiter.js";
import pool from "./db.js";
import helmet from "helmet";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

// function encodeToBase62(num) {
// 	const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
// 	let base62 = "";
// 	while (num > 0) {
// 		base62 = chars[num % 62] + base62;
// 		num = Math.floor(num / 62);
// 	}
// 	return base62;
// }

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generateShortCode = customAlphabet(alphabet, 6);

app.get("/api/test", (req, res) => {
    res.send("URL Shortener API is running");
});

app.post("/api/url", rateLimiter, async (req, res) => {
    try {
        const { originalUrl } = req.body;
        if (!originalUrl) {
            return res.status(400).json({
                error: "Original URL is required"
            })
        };

        if (typeof originalUrl !== 'string') {
            return res.status(400).json({
                error: "Original URL should be a string"
            });
        }

        if (originalUrl.length > 2048) {
            return res.status(400).json({
                error: "Original URL is too long"
            });
        }

        let url;
        try {
            url = new URL(originalUrl);
        } catch {
            return res.status(400).json({
                error: "Invalid URL"
            });
        }

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return res.status(400).json({
                error: "Only HTTP ans HTTPS URLS are allowed"
            });
        }

        // const shortCode = encodeToBase62(id);
        let shortCode;
        while (true) {
            shortCode = generateShortCode();
            try {
                const insertQuery = "INSERT INTO urls (original_url, short_code) VALUES ($1, $2)";
                await pool.query(insertQuery, [originalUrl, shortCode]);
                break;
            } catch (error) {
                if (error.code === '23505') {
                    console.log("Collision detected for short code:", shortCode);
                    continue;
                } else {
                    throw error;
                }
            }
        }
        res.status(201).json({ shortCode });
    } catch (error) {
        console.error("Error Inserting URL:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/:shortCode", async (req, res) => {
    try {
        const { shortCode } = req.params;
        const ipAddress = req.ip;
        const userAgent = req.get("User-Agent");
        const cacheKey = `url:${shortCode}`;
        const cachedUrl = await redisClient.get(cacheKey);
        let original_url;
        if (cachedUrl) {
            console.log("Cache hit for short code:", shortCode);
            original_url = cachedUrl;
        } else {
            const query = "SELECT original_url FROM urls WHERE short_code = $1";
            const result = await pool.query(query, [shortCode]);
            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: "Short URL not found"
                });
            }

            original_url = result.rows[0].original_url;
            await redisClient.set(cacheKey, original_url, {
                EX: 3600
            });
        }

        await analyticsQueue.add("click", {
            shortCode,
            ipAddress,
            userAgent
        },
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000
                },
                removeOnComplete: 100,
                removeOnFail: 500
            }
        );

        return res.redirect(original_url);
    } catch (error) {
        console.error("Error Retrieving URL:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/url/:shortCode/analytics", async (req, res) => {
    const { shortCode } = req.params;
    const searchIdQuery = "SELECT id FROM urls WHERE short_code = $1";
    const id = await pool.query(searchIdQuery, [shortCode]);
    if (id.rows.length === 0) {
        return res.status(404).json({
            error: "Short URL not found"
        })
    }
    const query = "SELECT COUNT(*) FROM analytics WHERE short_code = $1";
    const result = await pool.query(query, [shortCode]);
    const clicks = result.rows[0].count;
    const clickHistory = await pool.query("SELECT clicked_at, ip_address, user_agent FROM analytics WHERE short_code = $1 ORDER BY clicked_at DESC", [shortCode]);
    return res.status(200).json({
        shortCode: shortCode,
        clicks: clicks,
        clickHistory: clickHistory.rows
    });
});

app.get("/api/url/:shortCode/analytics/daily", async (req, res) => {
    const { shortCode } = req.params;
    const searchIdQuery = "SELECT id FROM urls WHERE short_code = $1";
    const id = await pool.query(searchIdQuery, [shortCode]);
    if (id.rows.length === 0) {
        return res.status(404).json({
            error: "Short URL not found"
        });
    }
    const query = `SELECT DATE(clicked_at) AS date, COUNT(*) AS clicks
        FROM analytics
        WHERE short_code = $1
        GROUP BY DATE(clicked_at)
        ORDER BY date DESC
        `;
    const result = await pool.query(query, [shortCode])
    return res.status(200).json({
        shortCode: shortCode,
        dailyClicks: result.rows
    });
});

app.use((err, req, res, next) => {
	console.error("Unhandled error:", err);
	res.status(500).json({
		error: "Internal server error"
	});
});

export default app;