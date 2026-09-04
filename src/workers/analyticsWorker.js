import { Worker } from "bullmq";
import pool from "../db.js";

const analyticsWorker = new Worker(
    "analytics",
    async (job) => {
        const { shortCode, ipAddress, userAgent } = job.data;

        console.log("Worker received job:", job.id);
        console.log("Job data:", job.data);

        await pool.query(
            `INSERT INTO analytics
            (short_code, ip_address, user_agent)
            VALUES ($1, $2, $3)`,
            [shortCode, ipAddress, userAgent]
        );

        console.log("Analytics inserted:", shortCode);
    },
    {
        connection: {
            host: "localhost",
            port: 6379
        }
    }
);

analyticsWorker.on("completed", (job) => {
    console.log(`Analytics job ${job.id} completed`);
});

analyticsWorker.on("failed", (job, error) => {
    console.error(`Analytics job ${job?.id} failed:`, error);
});

export default analyticsWorker;

