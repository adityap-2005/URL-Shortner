import app from "./app.js";
import pool from "./db.js";

pool.query("SELECT NOW()")
	.then(result => {
		console.log("Database connected:", result.rows[0]);
	})
	.catch(error => {
		console.error("Database connection failed:", error);
	});

app.listen(3000, () => {
	console.log("Server is running on port 3000");
});