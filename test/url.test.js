import request from "supertest";
import app from "../src/app.js";

test("GET /api/test should return API status", async () => {
    const response = await request(app).get("/api/test");

    expect(response.statusCode).toBe(200);
    expect(response.text).toBe("URL Shortener API is running");
});