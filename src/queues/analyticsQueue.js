import { Queue } from "bullmq";

const analyticsQueue = new Queue("analytics", {
    connection : {
        host : "localhost",
        port : 6379
    }
});

export default analyticsQueue;